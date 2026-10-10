"""Export the best Lightning checkpoint as one ONNX model for both phones."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from ml.manifest import load_catalog
from ml.model import MushroomNet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True, help="Training output directory")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    run = Path(args.run)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    config = json.loads((run / "training_config.json").read_text(encoding="utf-8"))
    labels = json.loads((run / "species_ids.json").read_text(encoding="utf-8"))
    catalog = {item["id"]: item for item in load_catalog(args.catalog)}
    species = [catalog[item_id] for item_id in labels]
    model = MushroomNet(config["backbone"], len(labels)).eval()
    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    state = {key.removeprefix("network."): value for key, value in checkpoint["state_dict"].items() if key.startswith("network.")}
    model.load_state_dict(state)
    sample = torch.randn(1, 3, 224, 224)
    model_path = output / "vision.onnx"
    torch.onnx.export(
        model, sample, str(model_path), export_params=True, opset_version=17,
        input_names=["image"], output_names=["presence_logit", "toxic_logit", "species_logits"],
        dynamic_axes=None, dynamo=False,
    )
    onnx.checker.check_model(str(model_path))
    pytorch_outputs = model(sample)
    runtime_outputs = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"]).run(None, {"image": sample.numpy()})
    for expected, actual in zip(pytorch_outputs, runtime_outputs):
        np.testing.assert_allclose(expected.detach().numpy(), actual, rtol=1e-3, atol=1e-4)
    metadata = {
        "modelVersion": output.name,
        "backbone": config["backbone"],
        "species": species,
        "presenceTemperature": 1.0,
        "toxicTemperature": 1.0,
        "speciesTemperature": 1.0,
        "releaseGatePassed": False,
    }
    (output / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Exported and verified {model_path}")


if __name__ == "__main__":
    main()
