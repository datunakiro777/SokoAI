import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class InstallModelTests(unittest.TestCase):
    def test_preview_keeps_edible_off_and_release_is_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model_dir = root / "model"
            mobile = root / "mobile"
            model_dir.mkdir()
            (mobile / "src" / "lib").mkdir(parents=True)
            for name in ("decision.ts", "inference.ts"):
                source = ROOT / "mobile" / "src" / "lib" / name
                (mobile / "src" / "lib" / name).write_bytes(source.read_bytes())
            model = model_dir / "vision.onnx"
            metadata = model_dir / "metadata.json"
            model.write_bytes(b"test-only-placeholder")
            metadata.write_text(json.dumps({
                "modelVersion": "test", "species": [], "presenceTemperature": 1,
                "toxicTemperature": 1, "speciesTemperature": 1,
                "releaseGatePassed": False,
            }), encoding="utf-8")
            report = root / "report.json"
            report.write_text(json.dumps({
                "model_sha256": digest(model),
                "metadata_sha256": digest(metadata),
                "decision_sha256": digest(ROOT / "ml" / "safety.py"),
                "mobile_decision_sha256": digest(mobile / "src" / "lib" / "decision.ts"),
                "mobile_inference_sha256": digest(mobile / "src" / "lib" / "inference.ts"),
                "gate_passed": False,
            }), encoding="utf-8")
            command = [sys.executable, "-m", "ml.install_model", "--model-dir", str(model_dir),
                       "--report", str(report), "--mobile-dir", str(mobile)]
            blocked = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(blocked.returncode, 0)
            self.assertFalse((mobile / "assets" / "vision.onnx").exists())

            preview = subprocess.run(command + ["--preview"], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(preview.returncode, 0, preview.stderr)
            bundle = (mobile / "src" / "lib" / "modelBundle.ts").read_text(encoding="utf-8")
            self.assertIn('"releaseGatePassed": false', bundle)


if __name__ == "__main__":
    unittest.main()
