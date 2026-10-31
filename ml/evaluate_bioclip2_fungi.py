"""Evaluate the BioCLIP 2 fungi matcher and the app's decision rules.

Runs the full-precision PyTorch model on every unique photo in one Danish
Fungi 2024 test file (six genera, expert labels), plus photos of everyday
objects (Imagenette), flowers (Oxford Flowers) and pets (Oxford-IIIT Pet).
A random subset also runs through the app's 8-bit TFLite model to measure
what quantization changes. Each photo is scored on its own, as a single-photo
scan in the app.

The decision rules mirror mobile/src/lib/fungiDecision.ts and the quality
check mirrors mobile/src/lib/inference.ts. Keep them in sync.

Data (download before running, into --data-dir):
  df24/data/test-00000-of-00002.parquet  maxvonk/danish-fungi-2024-pairs-800px
  flowers/data/test-*.parquet            nelorth/oxford-flowers
  pets/data/test-00000-of-00001.parquet  timm/oxford-iiit-pet
  imagenette/imagenette2-160/val/        fast.ai Imagenette (160 px)

Usage:
  python -m ml.evaluate_bioclip2_fungi --data-dir build/eval-data --report ml/results/bioclip2_eval.json
"""

from __future__ import annotations

import argparse
import io
import json
import random
import time
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

from ml.export_bioclip2_fungi import IMAGE_SIZE, download, fungal_species

SEED = 0
LOGIT_SCALE = 100
FUNGUS_SIMILARITY_GATE = 0.7
NAME_THRESHOLD = 0.6
WARNING_THRESHOLD = 0.05
CANDIDATES = 20
TOXIC_GENERA = {"Amanita", "Galerina", "Lepiota", "Cortinarius", "Clitocybe", "Inocybe", "Gyromitra"}
POISONOUS_SPECIES = {"Amanita muscaria", "Chlorophyllum molybdites", "Hypholoma fasciculare"}
# Imagenette's two animal classes (tench, English springer) are left out of "everyday objects".
IMAGENETTE_ANIMALS = {"n01440764", "n02102040"}


def app_pixels(image: Image.Image) -> tuple[np.ndarray, bool]:
    """Center square crop, 224 px resize, JPEG 0.95 round trip and quality check, as in the app."""
    image = image.convert("RGB")
    side = min(image.size)
    left, upper = (image.width - side) // 2, (image.height - side) // 2
    image = image.crop((left, upper, left + side, upper + side)).resize((IMAGE_SIZE, IMAGE_SIZE), Image.BILINEAR)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    pixels = np.asarray(Image.open(buffer).convert("RGB"), dtype=np.float32)
    luminance = (0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2]) / 255
    brightness = float(luminance.mean())
    variance = float((luminance ** 2).mean() - brightness ** 2)
    return pixels, 0.12 <= brightness <= 0.88 and variance >= 0.008


class Catalog:
    def __init__(self, species: list) -> None:
        self.names = [f"{taxonomy[5]} {taxonomy[6]}" for taxonomy, _ in species]
        unique_genera = sorted({taxonomy[5] for taxonomy, _ in species})
        self.genera = unique_genera
        genus_index = {genus: i for i, genus in enumerate(unique_genera)}
        self.genus_of = np.array([genus_index[taxonomy[5]] for taxonomy, _ in species])
        unique_names = sorted(set(self.names))
        self.unique_names = unique_names
        name_index = {name: i for i, name in enumerate(unique_names)}
        self.name_of = np.array([name_index[name] for name in self.names])

    def probabilities(self, similarities: np.ndarray) -> np.ndarray:
        weights = np.exp(LOGIT_SCALE * (similarities - similarities.max()))
        return weights / weights.sum()

    def by_name(self, probabilities: np.ndarray) -> np.ndarray:
        totals = np.zeros(len(self.unique_names))
        np.add.at(totals, self.name_of, probabilities)
        return totals

    def by_genus(self, probabilities: np.ndarray) -> np.ndarray:
        totals = np.zeros(len(self.genera))
        np.add.at(totals, self.genus_of, probabilities)
        return totals

    def decide(self, similarities: np.ndarray, quality_pass: bool) -> dict:
        """One-photo version of decideFungi in fungiDecision.ts."""
        if similarities.max() < FUNGUS_SIMILARITY_GATE:
            return {"kind": "notDetected"}
        if not quality_pass:
            return {"kind": "unknown"}
        probabilities = self.probabilities(similarities)
        # The app merges duplicate names among its 20 best species.
        top = np.argsort(-probabilities)[:CANDIDATES]
        merged: dict[str, float] = {}
        for index in top:
            merged[self.names[index]] = merged.get(self.names[index], 0.0) + float(probabilities[index])
        candidates = sorted(merged.items(), key=lambda item: -item[1])
        genera = self.by_genus(probabilities)
        best_genus = int(genera.argmax())
        warning = any(genera[self.genera.index(genus)] >= WARNING_THRESHOLD
                      for genus in TOXIC_GENERA if genus in self.genera)
        poisonous_candidate = any(name in POISONOUS_SPECIES and score >= WARNING_THRESHOLD for name, score in candidates)
        species = candidates[0][0] if candidates[0][1] >= NAME_THRESHOLD else None
        genus = self.genera[best_genus] if genera[best_genus] >= NAME_THRESHOLD else None
        if (species in POISONOUS_SPECIES) or poisonous_candidate or warning:
            kind = "notSafe"
        elif species or genus:
            kind = "uncertain"
        else:
            kind = "unknown"
        return {"kind": kind, "species": species, "genus": genus}


def parquet_images(path: Path, columns: list[str]) -> list[dict]:
    import pyarrow.parquet as pq
    return pq.read_table(path, columns=columns).to_pylist()


def danish_fungi(data_dir: Path) -> list[dict]:
    rows = parquet_images(data_dir / "df24/data/test-00000-of-00002.parquet",
                          ["images", "file_paths", "species1", "genus1", "poisonous1",
                           "species2", "genus2", "poisonous2"])
    photos: dict[str, dict] = {}
    for row in rows:
        for i in (0, 1):
            path = row["file_paths"][i]
            photos.setdefault(path, {
                "id": path,
                "bytes": row["images"][i]["bytes"],
                "species": row[f"species{i + 1}"],
                "genus": row[f"genus{i + 1}"],
                "poisonous": bool(row[f"poisonous{i + 1}"]),
            })
    return [photos[key] for key in sorted(photos)]


def other_photos(data_dir: Path, per_group: int, rng: random.Random) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    objects = sorted(path for path in (data_dir / "imagenette/imagenette2-160/val").glob("*/*.JPEG")
                     if path.parent.name not in IMAGENETTE_ANIMALS)
    groups["objects"] = [{"id": str(path), "bytes": path.read_bytes()} for path in rng.sample(objects, per_group)]
    for group, pattern in (("plants", "flowers/data/test-*.parquet"), ("animals", "pets/data/test-*.parquet")):
        rows = [row for path in sorted(data_dir.glob(pattern)) for row in parquet_images(path, ["image"])]
        groups[group] = [{"id": f"{group}-{i}", "bytes": rows[i]["image"]["bytes"]}
                         for i in sorted(rng.sample(range(len(rows)), per_group))]
    return groups


def torch_model(species_embeddings: np.ndarray):
    import open_clip
    import torch
    from safetensors.torch import load_file

    weights, _, _ = download()
    clip = open_clip.create_model("ViT-L-14", pretrained=None)
    clip.load_state_dict(load_file(str(weights)))
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    visual = clip.visual.eval().to(device)
    mean = torch.tensor([0.48145466, 0.4578275, 0.40821073], device=device).view(1, 3, 1, 1) * 255
    std = torch.tensor([0.26862954, 0.26130258, 0.27577711], device=device).view(1, 3, 1, 1) * 255
    species = torch.from_numpy(species_embeddings).to(device)

    def run(batch: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            image = torch.from_numpy(batch).to(device).permute(0, 3, 1, 2)
            features = visual((image - mean) / std)
            return ((features / features.norm(dim=-1, keepdim=True)) @ species).float().cpu().numpy()

    return run


def tflite_model(assets: Path, work: Path):
    from ai_edge_litert.interpreter import Interpreter

    model_path = work / "bioclip2-fungi-int8.tflite"
    with model_path.open("wb") as joined:
        for part in sorted(assets.glob("bioclip2-fungi-int8.part*.tflitepart")):
            joined.write(part.read_bytes())
    interpreter = Interpreter(model_path=str(model_path), num_threads=8)
    interpreter.allocate_tensors()
    input_index = interpreter.get_input_details()[0]["index"]
    output_index = interpreter.get_output_details()[0]["index"]

    def run(pixels: np.ndarray) -> np.ndarray:
        interpreter.set_tensor(input_index, pixels[None])
        interpreter.invoke()
        return interpreter.get_tensor(output_index)[0].copy()

    return run, model_path


def score(run, photos: list[dict], batch_size: int = 16) -> tuple[np.ndarray, list[bool]]:
    similarities, quality = [], []
    for start in range(0, len(photos), batch_size):
        prepared = [app_pixels(Image.open(io.BytesIO(photo["bytes"]))) for photo in photos[start:start + batch_size]]
        similarities.append(run(np.stack([pixels for pixels, _ in prepared])))
        quality += [passed for _, passed in prepared]
    return np.concatenate(similarities), quality


def fungi_report(catalog: Catalog, photos: list[dict], similarities: np.ndarray, quality: list[bool]) -> dict:
    known = set(catalog.unique_names)
    top1 = top5 = genus_top1 = in_catalog = 0
    kinds: Counter = Counter()
    named_species = named_species_correct = named_genus = named_genus_correct = 0
    toxic_genus = toxic_genus_warned = poisonous = poisonous_warned = harmless = harmless_warned = 0
    missed: Counter = Counter()
    per_genus: dict[str, Counter] = {}
    for photo, row, passed in zip(photos, similarities, quality):
        probabilities = catalog.probabilities(row)
        names = catalog.by_name(probabilities)
        ranked = [catalog.unique_names[i] for i in np.argsort(-names)[:5]]
        genus_guess = catalog.genera[int(catalog.by_genus(probabilities).argmax())]
        in_catalog += photo["species"] in known
        top1 += ranked[0] == photo["species"]
        top5 += photo["species"] in ranked
        genus_top1 += genus_guess == photo["genus"]
        decision = catalog.decide(row, passed)
        kinds[decision["kind"]] += 1
        stats = per_genus.setdefault(photo["genus"], Counter())
        stats["photos"] += 1
        stats["genus_top1"] += genus_guess == photo["genus"]
        stats["warned"] += decision["kind"] == "notSafe"
        if decision.get("species"):
            named_species += 1
            named_species_correct += decision["species"] == photo["species"]
        if decision.get("genus"):
            named_genus += 1
            named_genus_correct += decision["genus"] == photo["genus"]
        warned = decision["kind"] == "notSafe"
        if photo["genus"] in TOXIC_GENERA:
            toxic_genus += 1
            toxic_genus_warned += warned
        if photo["poisonous"]:
            poisonous += 1
            poisonous_warned += warned
            if not warned:
                missed[f"{photo['species']} -> {decision['kind']}"] += 1
        else:
            harmless += 1
            harmless_warned += warned
    total = len(photos)
    return {
        "photos": total,
        "species_in_model_list": in_catalog,
        "species_classes": len({photo["species"] for photo in photos}),
        "genera": dict(Counter(photo["genus"] for photo in photos).most_common()),
        "quality_pass": sum(quality),
        "species_top1": top1,
        "species_top5": top5,
        "genus_top1": genus_top1,
        "decisions": dict(kinds),
        "species_named": named_species,
        "species_named_correct": named_species_correct,
        "genus_named": named_genus,
        "genus_named_correct": named_genus_correct,
        "toxic_genus_photos": toxic_genus,
        "toxic_genus_warned": toxic_genus_warned,
        "poisonous_photos": poisonous,
        "poisonous_warned": poisonous_warned,
        "harmless_photos": harmless,
        "harmless_warned": harmless_warned,
        "poisonous_missed": dict(missed.most_common()),
        "per_genus": {genus: dict(stats) for genus, stats in sorted(per_genus.items())},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="build/eval-data")
    parser.add_argument("--mobile-dir", default="mobile")
    parser.add_argument("--report", default="ml/results/bioclip2_eval.json")
    parser.add_argument("--other-per-group", type=int, default=200)
    parser.add_argument("--int8-photos", type=int, default=200)
    parser.add_argument("--fungi-limit", type=int, help="score only this many fungus photos (smoke test)")
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    rng = random.Random(SEED)

    _, names_path, embeddings_path = download()
    species, species_embeddings = fungal_species(names_path, embeddings_path)
    catalog = Catalog(species)
    fungi = danish_fungi(data_dir)[:args.fungi_limit]
    others = other_photos(data_dir, args.other_per_group, rng)
    print(f"{len(species)} species, {len(fungi)} fungus photos, {sum(map(len, others.values()))} other photos")

    run = torch_model(species_embeddings)
    started = time.time()
    fungi_similarities, fungi_quality = score(run, fungi)
    report: dict = {"model": "BioCLIP 2 ViT-L/14, full precision (PyTorch)", "seed": SEED,
                    "fungi": fungi_report(catalog, fungi, fungi_similarities, fungi_quality), "not_fungi": {}}
    for group, photos in others.items():
        similarities, quality = score(run, photos)
        kinds = Counter(catalog.decide(row, passed)["kind"] for row, passed in zip(similarities, quality))
        report["not_fungi"][group] = {"photos": len(photos), "not_detected": kinds["notDetected"], "decisions": dict(kinds)}
    report["full_precision_seconds"] = round(time.time() - started, 1)
    print(json.dumps({key: report[key] for key in ("not_fungi",)}, indent=1))

    # The app's 8-bit model on a random subset of the same photos.
    subset = sorted(rng.sample(range(len(fungi)), args.int8_photos))
    run_int8, model_path = tflite_model(Path(args.mobile_dir) / "assets", data_dir)
    started = time.time()
    int8_rows = []
    for index in subset:
        pixels, _ = app_pixels(Image.open(io.BytesIO(fungi[index]["bytes"])))
        int8_rows.append(run_int8(pixels))
    int8_seconds = time.time() - started
    model_path.unlink()
    int8_similarities = np.stack(int8_rows)
    full_similarities = fungi_similarities[subset]
    subset_photos = [fungi[i] for i in subset]
    subset_quality = [fungi_quality[i] for i in subset]
    same_decision = sum(catalog.decide(a, q)["kind"] == catalog.decide(b, q)["kind"]
                        for a, b, q in zip(int8_similarities, full_similarities, subset_quality))
    report["int8_vs_full_precision"] = {
        "photos": len(subset),
        "max_similarity_difference": float(np.abs(int8_similarities - full_similarities).max()),
        "same_top_species": int(sum(a.argmax() == b.argmax() for a, b in zip(int8_similarities, full_similarities))),
        "same_decision": int(same_decision),
        "int8": fungi_report(catalog, subset_photos, int8_similarities, subset_quality),
        "full_precision": fungi_report(catalog, subset_photos, full_similarities, subset_quality),
        "int8_seconds_per_photo_on_mac_cpu": round(int8_seconds / len(subset), 2),
    }

    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {args.report}")


if __name__ == "__main__":
    main()
