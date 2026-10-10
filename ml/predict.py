"""On-device compatible image preprocessing and score conversion."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from ml.safety import ViewScores


MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess(path: str | Path) -> tuple[np.ndarray, bool]:
    with Image.open(path) as image:
        image = image.convert("RGB")
        side = min(image.size)
        left = (image.width - side) // 2
        top = (image.height - side) // 2
        image = image.crop((left, top, left + side, top + side))
        image = image.resize((224, 224), Image.Resampling.BILINEAR)
        pixels = np.asarray(image, dtype=np.float32) / 255.0
    luminance = pixels[:, :, 0] * 0.2126 + pixels[:, :, 1] * 0.7152 + pixels[:, :, 2] * 0.0722
    quality_pass = 0.12 <= float(luminance.mean()) <= 0.88 and float(luminance.var()) >= 0.008
    tensor = ((pixels - MEAN) / STD).transpose(2, 0, 1)[None, :, :, :].astype(np.float32)
    return tensor, quality_pass


def raw_logits(session: ort.InferenceSession, path: str | Path) -> tuple[float, float, np.ndarray, bool]:
    image, quality_pass = preprocess(path)
    presence, toxic, species = session.run(None, {"image": image})
    return float(presence.flat[0]), float(toxic.flat[0]), np.asarray(species[0], dtype=np.float64), quality_pass


def sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def view_scores(logits: tuple[float, float, np.ndarray, bool], metadata: dict) -> ViewScores:
    presence, toxic, species, quality_pass = logits
    scaled = species / metadata["speciesTemperature"]
    exp_values = np.exp(scaled - scaled.max())
    probabilities = exp_values / exp_values.sum()
    return ViewScores(
        presence=sigmoid(presence / metadata["presenceTemperature"]),
        toxic=sigmoid(toxic / metadata["toxicTemperature"]),
        species=tuple(float(value) for value in probabilities),
        quality_pass=quality_pass,
    )
