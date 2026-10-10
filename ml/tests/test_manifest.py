import csv
import tempfile
import unittest
from pathlib import Path

from ml.manifest import FIELDS, load_manifest


def base_rows():
    rows = []
    for split in ("train", "validation", "calibration", "test"):
        for view in ("cap", "underside", "base"):
            rows.append({
                "specimen_id": f"specimen-{split}",
                "observation_id": f"observation-{split}",
                "photo_path": f"{split}-{view}.jpg",
                "view": view,
                "species_id": "example-species",
                "toxicity": "poisonous",
                "license": "OWNED",
                "photographer": "Example photographer",
                "source_url": "https://example.org/record",
                "split": split,
                "region": "Georgia",
                "lookalike_group": "example-group",
            })
    return rows


def load_rows(rows):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "manifest.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=sorted(FIELDS))
            writer.writeheader()
            writer.writerows(rows)
        return load_manifest(path, check_files=False)


class ManifestTests(unittest.TestCase):
    def test_valid_four_way_split(self):
        self.assertEqual(len(load_rows(base_rows())), 12)

    def test_same_specimen_cannot_cross_splits(self):
        rows = base_rows()
        rows[3]["specimen_id"] = rows[0]["specimen_id"]
        with self.assertRaisesRegex(ValueError, "Specimen crosses split"):
            load_rows(rows)

    def test_test_specimen_cannot_count_twice(self):
        rows = base_rows()
        duplicate = dict(rows[-1])
        duplicate["observation_id"] = "another-observation"
        duplicate["photo_path"] = "another.jpg"
        with self.assertRaisesRegex(ValueError, "Test specimen has multiple observations"):
            load_rows(rows + [duplicate])

    def test_noncommercial_license_is_rejected(self):
        rows = base_rows()
        rows[0]["license"] = "CC-BY-NC"
        with self.assertRaisesRegex(ValueError, "Commercial license not cleared"):
            load_rows(rows)

    def test_training_pilot_can_omit_untouched_test_split(self):
        rows = [r for r in base_rows() if r["split"] != "test"]
        rows[0]["view"] = "unspecified"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.csv"
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=sorted(FIELDS))
                writer.writeheader()
                writer.writerows(rows)
            self.assertEqual(len(load_manifest(path, check_files=False, require_test=False)), 9)
            with self.assertRaisesRegex(ValueError, "Untouched test split"):
                load_manifest(path, check_files=False)


if __name__ == "__main__":
    unittest.main()
