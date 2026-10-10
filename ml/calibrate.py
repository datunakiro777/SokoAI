"""Fit logit temperatures on the calibration split, never on test."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from scipy.optimize import minimize_scalar
from scipy.special import expit, logsumexp

from ml.manifest import load_manifest
from ml.predict import raw_logits


def fit_binary(logits: np.ndarray, labels: np.ndarray) -> float:
    if len(np.unique(labels)) < 2:
        raise ValueError("Both positive and negative examples are needed for binary calibration")

    def loss(log_temperature: float) -> float:
        scores = logits / np.exp(log_temperature)
        return float(np.mean(np.logaddexp(0, scores) - labels * scores))

    result = minimize_scalar(loss, bounds=(np.log(0.05), np.log(20)), method="bounded")
    return float(np.exp(result.x))


def fit_species(logits: np.ndarray, labels: np.ndarray) -> float:
    if len(labels) < 2:
        raise ValueError("More species calibration examples are needed")

    def loss(log_temperature: float) -> float:
        scores = logits / np.exp(log_temperature)
        return float(np.mean(logsumexp(scores, axis=1) - scores[np.arange(len(labels)), labels]))

    result = minimize_scalar(loss, bounds=(np.log(0.05), np.log(20)), method="bounded")
    return float(np.exp(result.x))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--model-dir", required=True)
    args = parser.parse_args()
    model_dir = Path(args.model_dir)
    metadata_path = model_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    labels = {item["id"]: index for index, item in enumerate(metadata["species"])}
    rows = [row for row in load_manifest(args.manifest) if row["split"] == "calibration"]
    if not rows:
        raise ValueError("No calibration photos")
    session = ort.InferenceSession(str(model_dir / "vision.onnx"), providers=["CPUExecutionProvider"])
    presence_logits, presence_labels = [], []
    toxic_logits, toxic_labels = [], []
    species_logits, species_labels = [], []
    for row in rows:
        presence, toxic, species, _ = raw_logits(session, row["absolute_path"])
        presence_logits.append(presence)
        presence_labels.append(int(row["species_id"] != "__none__"))
        if row["toxicity"] in {"edible", "poisonous"}:
            toxic_logits.append(toxic)
            toxic_labels.append(int(row["toxicity"] == "poisonous"))
        if row["species_id"] in labels:
            species_logits.append(species)
            species_labels.append(labels[row["species_id"]])

    metadata["presenceTemperature"] = fit_binary(np.asarray(presence_logits), np.asarray(presence_labels))
    metadata["toxicTemperature"] = fit_binary(np.asarray(toxic_logits), np.asarray(toxic_labels))
    metadata["speciesTemperature"] = fit_species(np.asarray(species_logits), np.asarray(species_labels))
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print("Calibrated temperatures:", {key: metadata[key] for key in ("presenceTemperature", "toxicTemperature", "speciesTemperature")})


if __name__ == "__main__":
    main()
