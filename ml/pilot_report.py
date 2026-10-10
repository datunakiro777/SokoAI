"""Small validation diagnostics for a pilot checkpoint, never a safety evaluation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from ml.manifest import load_manifest
from ml.train import MushroomDataset, MushroomModule


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--species-ids", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    rows = [r for r in load_manifest(args.manifest, require_test=False) if r["split"] == "validation"]
    species_ids = json.loads(Path(args.species_ids).read_text(encoding="utf-8"))
    dataset = MushroomDataset(rows, species_ids, augment=False)
    model = MushroomModule.load_from_checkpoint(args.checkpoint, map_location="cpu")
    model.eval()
    counts = {"photos": 0, "presence_correct": 0, "mushrooms": 0,
              "species_correct": 0, "poisonous": 0, "poisonous_detected": 0,
              "edible": 0, "edible_detected": 0}
    with torch.inference_mode():
        for images, present, species, toxic in DataLoader(dataset, batch_size=16, num_workers=0):
            presence_logits, toxic_logits, species_logits = model.network(images)
            present_pred = (presence_logits.flatten().sigmoid() >= 0.5)
            toxic_pred = (toxic_logits.flatten().sigmoid() >= 0.5)
            counts["photos"] += len(images)
            counts["presence_correct"] += int((present_pred == present.bool()).sum())
            mushroom = species >= 0
            poisonous = toxic == 1
            edible = toxic == 0
            counts["mushrooms"] += int(mushroom.sum())
            counts["species_correct"] += int(((species_logits.argmax(1) == species) & mushroom).sum())
            counts["poisonous"] += int(poisonous.sum())
            counts["poisonous_detected"] += int((toxic_pred & poisonous).sum())
            counts["edible"] += int(edible.sum())
            counts["edible_detected"] += int((~toxic_pred & edible).sum())
    report = {"status": "pilot_validation_only_not_release_evaluation",
              "checkpoint": args.checkpoint, "counts": counts,
              "presence_accuracy": counts["presence_correct"] / counts["photos"],
              "species_top1_accuracy": counts["species_correct"] / counts["mushrooms"],
              "poisonous_recall_at_uncalibrated_0_5": counts["poisonous_detected"] / counts["poisonous"],
              "edible_specificity_at_uncalibrated_0_5": counts["edible_detected"] / counts["edible"]}
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
