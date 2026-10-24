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


def fungal_indices(names: list) -> list[int]:
    return [i for i, (taxonomy, _) in enumerate(names) if taxonomy[0] == "Fungi"]


def fungal_species(names_path: Path, embeddings_path: Path) -> tuple[list, np.ndarray]:
    names = json.loads(names_path.read_text(encoding="utf-8"))
    indices = fungal_indices(names)
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
    prepare_for_mobile(output)


def prepare_for_mobile(path: Path) -> None:
    """Rewrite the quantized model so the phone's TFLite runs it correctly.

    1. Store every weight inside the flatbuffer instead of after it. The
       quantizer writes large weights after the flatbuffer and refers to them
       by offset. TFLite's C API, which react-native-fast-tflite uses, builds
       its interpreter without the model allocation, so it cannot resolve
       those offsets and invoke fails with "Input tensor N lacks data".
    2. Quantize fully-connected inputs asymmetrically. Without XNNPACK,
       TFLite 1.4's ARM kernels return results off by orders of magnitude for
       these per-channel hybrid layers with symmetric input quantization
       (reproduced on emulated Cortex-A53, A76 and Neoverse N2). XNNPACK
       results are unchanged by this flag.
    """
    from ai_edge_litert import schema_py_generated as schema
    from ai_edge_litert.tools import flatbuffer_utils

    raw = path.read_bytes()
    model = flatbuffer_utils.convert_bytearray_to_object(raw)
    for buffer in model.buffers:
        if buffer.offset > 1:
            buffer.data = np.frombuffer(raw, np.uint8, buffer.size, buffer.offset)
            buffer.offset = 0
            buffer.size = 0
    for operator in model.subgraphs[0].operators:
        code = model.operatorCodes[operator.opcodeIndex]
        if max(code.builtinCode, code.deprecatedBuiltinCode) == schema.BuiltinOperator.FULLY_CONNECTED:
            operator.builtinOptions.asymmetricQuantizeInputs = True

    pack = schema.BufferT.Pack

    def pack_aligned(self, builder):
        # Keep weights 16-byte aligned, as the converter does.
        if self.data is None:
            return pack(self, builder)
        data = np.asarray(self.data, np.uint8).tobytes()
        builder.StartVector(1, len(data), 16)
        builder.head -= len(data)
        builder.Bytes[builder.head:builder.head + len(data)] = data
        builder.vectorNumElems = len(data)
        vector = builder.EndVector()
        schema.BufferStart(builder)
        schema.BufferAddData(builder, vector)
        return schema.BufferEnd(builder)

    schema.BufferT.Pack = pack_aligned
    try:
        path.write_bytes(flatbuffer_utils.convert_object_to_bytearray(model))
    finally:
        schema.BufferT.Pack = pack


def write_catalog(species: list, path: Path) -> None:
    """Rows: [genus, epithet, family, common name, order, class, phylum] (ranks as list indices)."""
    ranks: dict[str, dict[str, int]] = {rank: {} for rank in ("genera", "families", "orders", "classes", "phyla")}

    def index(rank: str, name: str) -> int:
        return ranks[rank].setdefault(name, len(ranks[rank]))

    rows = []
    for taxonomy, common in species:
        _, phylum, class_, order, family, genus, epithet = taxonomy
        # Common names come from mixed languages; keep plain ASCII (mostly English) ones.
        rows.append([
            index("genera", genus),
            epithet,
            index("families", family),
            common if common.isascii() else "",
            index("orders", order),
            index("classes", class_),
            index("phyla", phylum),
        ])
    catalog = {rank: list(names) for rank, names in ranks.items()}
    catalog["species"] = rows
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
    parser.add_argument("--catalog-only", action="store_true", help="only rewrite the species catalog (needs --names)")
    args = parser.parse_args()

    mobile = Path(args.mobile_dir)
    if args.catalog_only:
        names = json.loads(Path(args.names).read_text(encoding="utf-8"))
        write_catalog([names[i] for i in fungal_indices(names)], mobile / "src/lib/fungiCatalog.json")
        return
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
