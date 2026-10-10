"""Licensed data contract and leakage checks."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path


FIELDS = {
    "specimen_id", "observation_id", "photo_path", "view", "species_id", "toxicity",
    "license", "photographer", "source_url", "split", "region", "lookalike_group",
}
ALLOWED_LICENSES = {"CC0", "CC-BY-4.0", "OWNED"}
SPLITS = {"train", "validation", "calibration", "test"}
VIEWS = {"cap", "underside", "base"}


def load_manifest(path: str | Path, *, check_files: bool = True) -> list[dict[str, str]]:
    path = Path(path)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = FIELDS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Manifest missing columns: {', '.join(sorted(missing))}")
        rows = [{key: (value or "").strip() for key, value in row.items()} for row in reader]
    if not rows:
        raise ValueError("Manifest has no photos")

    observations: dict[str, tuple[str, str, str, str, str, str]] = {}
    specimens: dict[str, tuple[str, str, str, str]] = {}
    test_specimen_observations: dict[str, str] = {}
    view_keys: set[tuple[str, str]] = set()
    hashes: dict[str, str] = {}
    for row in rows:
        observation_id = row["observation_id"]
        specimen_id = row["specimen_id"]
        if not specimen_id or not observation_id or not row["photo_path"]:
            raise ValueError("Every photo needs a specimen ID, observation ID, and path")
        if row["split"] not in SPLITS or row["view"] not in VIEWS:
            raise ValueError(f"Invalid split or view for {observation_id}")
        if row["license"] not in ALLOWED_LICENSES:
            raise ValueError(f"Commercial license not cleared: {row['license']} ({observation_id})")
        if not row["photographer"] or not row["source_url"]:
            raise ValueError(f"Attribution/provenance missing: {observation_id}")
        if row["toxicity"] not in {"poisonous", "edible", "unknown"}:
            raise ValueError(f"Invalid toxicity: {observation_id}")
        if row["species_id"] == "__none__" and row["toxicity"] != "unknown":
            raise ValueError(f"Non-mushroom marked edible or poisonous: {observation_id}")
        if not row["species_id"]:
            raise ValueError(f"Species ID missing: {observation_id}; use __none__ for non-mushroom")
        identity = (specimen_id, row["split"], row["species_id"], row["toxicity"],
                    row["region"], row["lookalike_group"])
        previous = observations.setdefault(observation_id, identity)
        if previous != identity:
            raise ValueError(f"Observation crosses split or conflicts in labels: {observation_id}")
        specimen_identity = (row["split"], row["species_id"], row["toxicity"], row["region"])
        if specimens.setdefault(specimen_id, specimen_identity) != specimen_identity:
            raise ValueError(f"Specimen crosses split or conflicts in labels: {specimen_id}")
        if row["split"] == "test":
            other_observation = test_specimen_observations.setdefault(specimen_id, observation_id)
            if other_observation != observation_id:
                raise ValueError(f"Test specimen has multiple observations: {specimen_id}")
        key = observation_id, row["view"]
        if key in view_keys:
            raise ValueError(f"Duplicate view for observation {observation_id}: {row['view']}")
        view_keys.add(key)
        if check_files:
            photo = (path.parent / row["photo_path"]).resolve()
            if not photo.is_file():
                raise ValueError(f"Photo missing: {photo}")
            digest = hashlib.sha256(photo.read_bytes()).hexdigest()
            other = hashes.setdefault(digest, f"{observation_id}/{row['view']}")
            if other != f"{observation_id}/{row['view']}":
                raise ValueError(f"Duplicate image: {other} and {observation_id}/{row['view']}")
            row["absolute_path"] = str(photo)

    grouped = defaultdict(set)
    for row in rows:
        grouped[row["observation_id"]].add(row["view"])
    for row in rows:
        if row["split"] == "test" and grouped[row["observation_id"]] != VIEWS:
            raise ValueError(f"Test observation needs all three views: {row['observation_id']}")
    if not any(row["split"] == "test" for row in rows):
        raise ValueError("Untouched test split is required")
    if not any(row["split"] == "validation" for row in rows):
        raise ValueError("Validation split is required")
    if not any(row["split"] == "calibration" for row in rows):
        raise ValueError("Calibration split is required")
    return rows


def load_catalog(path: str | Path) -> list[dict]:
    catalog = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(catalog, list):
        raise ValueError("Catalog must be a list")
    ids = set()
    for item in catalog:
        if not isinstance(item, dict) or not item.get("id") or not item.get("scientificName"):
            raise ValueError("Catalog species need id and scientificName")
        if item["id"] in ids:
            raise ValueError(f"Duplicate catalog species: {item['id']}")
        ids.add(item["id"])
        if item.get("toxicity") not in {"poisonous", "edible", "unknown"}:
            raise ValueError(f"Invalid catalog toxicity: {item['id']}")
        if item["toxicity"] != "unknown" and not item.get("toxicitySource"):
            raise ValueError(f"Missing toxicity source: {item['id']}")
        nutrition = item.get("nutrition")
        if nutrition and (not nutrition.get("sourceId") or any(field not in nutrition for field in ("caloriesKcal", "proteinG", "carbsG", "fatG"))):
            raise ValueError(f"Incomplete nutrition source: {item['id']}")
    return catalog


def validate_labels(rows: list[dict[str, str]], catalog: list[dict]) -> list[str]:
    lookup = {item["id"]: item for item in catalog}
    training_ids = sorted({row["species_id"] for row in rows if row["split"] == "train" and row["species_id"] != "__none__"})
    if not training_ids:
        raise ValueError("No mushroom species in training data")
    for row in rows:
        species_id = row["species_id"]
        if species_id == "__none__":
            continue
        if species_id not in lookup:
            if row["split"] != "test":
                raise ValueError(f"Catalog missing species: {species_id}")
            continue  # Unknown species may be deliberately reserved for test.
        if lookup[species_id]["toxicity"] != row["toxicity"]:
            raise ValueError(f"Catalog toxicity mismatch: {species_id}")
    return training_ids
