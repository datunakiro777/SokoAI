"""Collect a small, license-checked iNaturalist pilot; never use it for release evaluation.

Each observation contributes at most one photo. Community IDs are provisional and
must be independently reviewed before any safety claim or release-gate evaluation.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode

from ml.manifest import FIELDS, load_manifest


SPECIES = [
    ("Amanita phalloides", "poisonous", "https://www.poison.org/articles/wild-mushroom-warning"),
    ("Paxillus involutus", "poisonous", "https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/fungi-and-lichens/brown-roll-rim/"),
    ("Boletus edulis", "edible", "https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/fungi-and-lichens/penny-bun/"),
    ("Cantharellus cibarius", "edible", "https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/fungi-and-lichens/chanterelle/"),
    ("Quercus robur", "unknown", None),  # Non-mushroom negative control.
]
API = "https://api.inaturalist.org/v1/observations"


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                    "--retry", "3", "--max-time", "30", "--output", str(destination), url], check=True)


def fetch_json(url: str, destination: Path) -> dict:
    download(url, destination)
    return json.loads(destination.read_text(encoding="utf-8"))


def collect(output: Path, per_class: int) -> None:
    output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(20261010)
    rows = []
    provenance = []
    for name, toxicity, source in SPECIES:
        params = urlencode({"taxon_name": name, "photos": "true", "photo_license": "cc0",
                            "quality_grade": "research", "per_page": "200", "order": "desc",
                            "order_by": "observed_on"})
        page_file = output / "api" / f"{name.replace(' ', '_')}.json"
        data = fetch_json(f"{API}?{params}", page_file)
        candidates = []
        for observation in data.get("results", []):
            if observation.get("taxon", {}).get("name") != name:
                continue
            photos = [p for p in observation.get("photos", [])
                      if p.get("license_code") == "cc0" and p.get("url")]
            if photos:
                candidates.append((observation, photos[0]))
        rng.shuffle(candidates)
        selected = candidates[:per_class]
        if len(selected) < per_class:
            raise ValueError(f"Only {len(selected)} exact-species CC0 observations for {name}; requested {per_class}")
        for index, (observation, photo) in enumerate(selected):
            obs_id = str(observation["id"])
            image_url = photo["url"].replace("/square.", "/medium.")
            image_path = Path("photos") / f"{obs_id}-{photo['id']}.jpg"
            try:
                download(image_url, output / image_path)
            except subprocess.CalledProcessError:
                print(f"Skipped unavailable image {image_url}", flush=True)
                continue
            split = "train" if index < per_class * 0.7 else "validation" if index < per_class * 0.85 else "calibration"
            row = {
                "specimen_id": f"inat-observation-{obs_id}",
                "observation_id": f"inat-{obs_id}",
                "photo_path": str(image_path),
                "view": "unspecified",
                "species_id": "__none__" if name == "Quercus robur" else name.replace(" ", "_").lower(),
                "toxicity": toxicity,
                "license": "CC0",
                "photographer": (photo.get("attribution") or observation.get("user", {}).get("login") or "iNaturalist contributor"),
                "source_url": f"https://www.inaturalist.org/observations/{obs_id}",
                "split": split,
                "region": (observation.get("place_guess") or "unknown"),
                "lookalike_group": "pilot-unreviewed",
            }
            rows.append(row)
            provenance.append({"observation_id": obs_id, "photo_id": photo["id"],
                               "image_url": image_url, "photo_license": photo["license_code"],
                               "taxon": name, "research_grade": observation.get("quality_grade"),
                               "observation_url": row["source_url"]})
            time.sleep(0.05)
        print(f"{name}: {sum(r['species_id'] == row['species_id'] for r in rows)} photos", flush=True)
        time.sleep(1.1)

    catalog = [{"id": name.replace(" ", "_").lower(), "scientificName": name,
                "toxicity": toxicity, "toxicitySource": source}
               for name, toxicity, source in SPECIES if name != "Quercus robur"]
    (output / "catalog.json").write_text(json.dumps(catalog, indent=2), encoding="utf-8")
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    manifest = output / "manifest.csv"
    with manifest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=sorted(FIELDS))
        writer.writeheader()
        writer.writerows(rows)
    load_manifest(manifest, require_test=False)
    print(f"Pilot dataset ready: {len(rows)} photos, {manifest}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("ml/data/inat-pilot"))
    parser.add_argument("--per-class", type=int, default=40)
    arguments = parser.parse_args()
    collect(arguments.output, arguments.per_class)
