"""Export BioCLIP 2 as an offline, fungi-only species matcher for the mobile app.

The exported TFLite model takes one RGB photo (224x224, values 0-255, NHWC)
and returns its cosine similarity to the BioCLIP 2 text embedding of every
fungal species in TreeOfLife-200M. The app turns those similarities into
species and genus matches. It is a species-identification aid, not an
eating-safety model, and must never enable an edible verdict.

Sources (downloaded from Hugging Face):
  imageomics/bioclip-2 (MIT) and the TreeOfLife-200M species text
  embeddings (CC0).

Usage:
  pip install -r ml/requirements.txt
  python -m ml.export_bioclip2_fungi --mobile-dir mobile
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

MODEL_REPO = "imageomics/bioclip-2"
EMBEDDING_REPO = "imageomics/TreeOfLife-200M"
IMAGE_SIZE = 224
# GitHub rejects files over 100 MB, so the model ships in smaller parts.
PART_BYTES = 90 * 1024 * 1024
MODEL_NAME = "bioclip2-fungi-int8"


def download() -> tuple[Path, Path, Path]:
    from huggingface_hub import hf_hub_download

    weights = hf_hub_download(MODEL_REPO, "open_clip_model.safetensors")
    names = hf_hub_download(EMBEDDING_REPO, "embeddings/txt_emb_species.json", repo_type="dataset")
    embeddings = hf_hub_download(EMBEDDING_REPO, "embeddings/txt_emb_species.npy", repo_type="dataset")
    return Path(weights), Path(names), Path(embeddings)


def fungal_species(names_path: Path, embeddings_path: Path) -> tuple[list, np.ndarray]:
    names = json.loads(names_path.read_text(encoding="utf-8"))
    indices = [i for i, (taxonomy, _) in enumerate(names) if taxonomy[0] == "Fungi"]
    embeddings = np.load(embeddings_path, mmap_mode="r")  # (dim, species), unit columns
    return [names[i] for i in indices], np.ascontiguousarray(embeddings[:, indices], dtype=np.float32)


def convert(weights_path: Path, species_embeddings: np.ndarray, output: Path) -> None:
    import litert_torch
    import open_clip
    import torch
    from ai_edge_quantizer import quantizer, recipe
    from safetensors.torch import load_file

    clip = open_clip.create_model("ViT-L-14", pretrained=None)
    clip.load_state_dict(load_file(str(weights_path)))
    clip.eval()

    class FungusSimilarity(torch.nn.Module):
        """RGB 0-255 NHWC image -> cosine similarity to every fungal species."""

        def __init__(self) -> None:
            super().__init__()
            self.visual = clip.visual
            mean = torch.tensor([0.48145466, 0.4578275, 0.40821073]) * 255
            std = torch.tensor([0.26862954, 0.26130258, 0.27577711]) * 255
            self.register_buffer("mean", mean.view(1, 3, 1, 1))
            self.register_buffer("std", std.view(1, 3, 1, 1))
            self.register_buffer("species", torch.from_numpy(species_embeddings))

        def forward(self, image: torch.Tensor) -> torch.Tensor:
            features = self.visual((image.permute(0, 3, 1, 2) - self.mean) / self.std)
            return (features / features.norm(dim=-1, keepdim=True)) @ self.species

    model = FungusSimilarity().eval()
    sample = torch.rand(1, IMAGE_SIZE, IMAGE_SIZE, 3) * 255
    with torch.no_grad():
        reference = model(sample).numpy()
    float_path = output.with_suffix(".fp32.tflite")
    edge_model = litert_torch.convert(model, (sample,))
    difference = float(np.abs(edge_model(sample) - reference).max())
    if difference > 1e-3:
        raise SystemExit(f"Converted model differs from PyTorch by {difference}")
    edge_model.export(str(float_path))

    # Dynamic-range int8 weights: about 4x smaller with no measured accuracy loss.
    quantized = quantizer.Quantizer(str(float_path))
    quantized.load_quantization_recipe(recipe.dynamic_wi8_afp32())
    quantized.quantize().export_model(str(output), overwrite=True)
    float_path.unlink()


def write_catalog(species: list, path: Path) -> None:
    genera: dict[str, int] = {}
    families: dict[str, int] = {}
    rows = []
    for taxonomy, common in species:
        family, genus, epithet = taxonomy[4], taxonomy[5], taxonomy[6]
        # Common names come from mixed languages; keep plain ASCII (mostly English) ones.
        rows.append([
            genera.setdefault(genus, len(genera)),
            epithet,
            families.setdefault(family, len(families)),
            common if common.isascii() else "",
        ])
    catalog = {"genera": list(genera), "families": list(families), "species": rows}
    path.write_text(json.dumps(catalog, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


def split(model_path: Path, assets: Path) -> list[str]:
    for old in assets.glob(f"{MODEL_NAME}.part*.tflitepart"):
        old.unlink()
    data = model_path.read_bytes()
    names = []
    for index, start in enumerate(range(0, len(data), PART_BYTES)):
        name = f"{MODEL_NAME}.part{index}.tflitepart"
        (assets / name).write_bytes(data[start:start + PART_BYTES])
        names.append(name)
    return names


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mobile-dir", default="mobile")
    parser.add_argument("--work-dir", default="build/bioclip2")
    parser.add_argument("--weights", help="local open_clip_model.safetensors (skips download)")
    parser.add_argument("--names", help="local txt_emb_species.json")
    parser.add_argument("--embeddings", help="local txt_emb_species.npy")
    args = parser.parse_args()

    mobile = Path(args.mobile_dir)
    work = Path(args.work_dir)
    work.mkdir(parents=True, exist_ok=True)
    if args.weights and args.names and args.embeddings:
        weights, names, embeddings = Path(args.weights), Path(args.names), Path(args.embeddings)
    else:
        weights, names, embeddings = download()
    species, species_embeddings = fungal_species(names, embeddings)
    model_path = work / f"{MODEL_NAME}.tflite"
    convert(weights, species_embeddings, model_path)

    write_catalog(species, mobile / "src/lib/fungiCatalog.json")
    parts = split(model_path, mobile / "assets")
    data = model_path.read_bytes()
    requires = "\n".join(
        f"  require('../../assets/{name}'),  // eslint-disable-line @typescript-eslint/no-require-imports"
        for name in parts
    )
    (mobile / "src/lib/fungiModel.ts").write_text(
        "// Generated by ml/export_bioclip2_fungi.py. Do not edit.\n"
        f"export const FUNGI_MODEL_NAME = '{MODEL_NAME}';\n"
        f"export const FUNGI_MODEL_BYTES = {len(data)};\n"
        f"export const FUNGI_MODEL_SHA256 = '{hashlib.sha256(data).hexdigest()}';\n"
        f"export const FUNGI_SPECIES_COUNT = {len(species)};\n"
        f"export const FUNGI_IMAGE_SIZE = {IMAGE_SIZE};\n"
        "// Metro needs static requires to bundle each part.\n"
        f"export const FUNGI_MODEL_PARTS: number[] = [\n{requires}\n];\n",
        encoding="utf-8",
    )
    print(f"{len(species)} fungal species, {len(data) / 1e6:.1f} MB in {len(parts)} parts")


if __name__ == "__main__":
    main()
