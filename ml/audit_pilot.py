"""Flag visually similar photos that might leak across pilot data splits."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from ml.manifest import load_manifest


def difference_hash(path: str) -> int:
    with Image.open(path) as source:
        pixels = np.asarray(source.convert("L").resize((9, 8))).ravel()
    return sum((pixels[y * 9 + x] > pixels[y * 9 + x + 1]) << (y * 8 + x)
               for y in range(8) for x in range(8))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-distance", type=int, default=3)
    args = parser.parse_args()
    rows = load_manifest(args.manifest, require_test=False)
    images = [(row, difference_hash(row["absolute_path"])) for row in rows]
    candidates = []
    for index, (left, left_hash) in enumerate(images):
        for right, right_hash in images[index + 1:]:
            if left["split"] == right["split"]:
                continue
            distance = (left_hash ^ right_hash).bit_count()
            if distance <= args.max_distance:
                candidates.append({"left_observation": left["observation_id"],
                                   "left_split": left["split"],
                                   "right_observation": right["observation_id"],
                                   "right_split": right["split"],
                                   "distance": distance})
    report = {"status": "pilot_near_duplicate_screen_not_expert_review",
              "photos": len(images), "cross_split_candidates": candidates}
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"{len(images)} photos; {len(candidates)} cross-split near-duplicate candidates")


if __name__ == "__main__":
    main()
