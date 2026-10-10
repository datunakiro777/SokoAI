"""Run once on the untouched, specimen-level test split after model selection."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import onnxruntime as ort

from ml.manifest import load_manifest
from ml.predict import raw_logits, view_scores
from ml.safety import decide, release_gate


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    model_dir = Path(args.model_dir)
    repository = Path(__file__).resolve().parents[1]
    model_path = model_dir / "vision.onnx"
    metadata_path = model_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    test_rows = [row for row in load_manifest(args.manifest) if row["split"] == "test"]
    by_observation = defaultdict(list)
    for row in test_rows:
        by_observation[row["observation_id"]].append(row)
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    species_ids = [item["id"] for item in metadata["species"]]
    toxicity_by_species = {item["id"]: item["toxicity"] for item in metadata["species"]}

    poisonous = edible = false_safe = edible_accepted = 0
    unknown_or_uncertain = mushroom_cases = 0
    lookalike_poisonous = lookalike_false_safe = 0
    nonmushroom = nonmushroom_edible = 0
    unfamiliar = unfamiliar_likely_edible = 0
    per_poisonous_species: dict[str, dict[str, int]] = defaultdict(lambda: {"specimens": 0, "false_safe": 0})
    per_lookalike_group: dict[str, dict[str, int]] = defaultdict(lambda: {"poisonous_specimens": 0, "false_safe": 0})
    decisions: list[dict] = []
    for observation_id, rows in sorted(by_observation.items()):
        ordered = sorted(rows, key=lambda row: {"cap": 0, "underside": 1, "base": 2}[row["view"]])
        truth = ordered[0]["toxicity"]
        region = ordered[0]["region"].lower()
        regional = region in {"georgia", "caucasus"}
        # Assess the *candidate* edible rule even while the production app's release gate is off.
        views = [view_scores(raw_logits(session, row["absolute_path"]), metadata) for row in ordered]
        decision = decide(views, species_ids, toxicity_by_species,
                          release_gate_passed=True, in_region=regional)
        accepted = decision.kind == "likelyEdible"
        if ordered[0]["species_id"] == "__none__":
            nonmushroom += 1
            nonmushroom_edible += int(accepted)
        elif regional:
            if ordered[0]["species_id"] not in species_ids:
                unfamiliar += 1
                unfamiliar_likely_edible += int(accepted)
            mushroom_cases += 1
            unknown_or_uncertain += int(decision.kind in {"unknown", "uncertain"})
            if truth == "poisonous":
                poisonous += 1
                false_safe += int(accepted)
                per_poisonous_species[ordered[0]["species_id"]]["specimens"] += 1
                per_poisonous_species[ordered[0]["species_id"]]["false_safe"] += int(accepted)
                if ordered[0]["lookalike_group"]:
                    lookalike_poisonous += 1
                    lookalike_false_safe += int(accepted)
                    group = per_lookalike_group[ordered[0]["lookalike_group"]]
                    group["poisonous_specimens"] += 1
                    group["false_safe"] += int(accepted)
            elif truth == "edible":
                edible += 1
                edible_accepted += int(accepted)
        decisions.append({
            "observation_id": observation_id,
            "true_species": ordered[0]["species_id"],
            "true_toxicity": truth,
            "region": ordered[0]["region"],
            "decision": decision.kind,
            "predicted_species": decision.species_id,
            "species_confidence": decision.species_confidence,
            "toxic_probability": decision.toxic_probability,
        })

    risk = release_gate(false_safe, poisonous)
    required_cohorts_present = lookalike_poisonous > 0 and nonmushroom > 0 and unfamiliar > 0 and edible > 0
    passed = bool(risk["passed"] and required_cohorts_present
                  and lookalike_false_safe == 0 and nonmushroom_edible == 0
                  and unfamiliar_likely_edible == 0 and edible_accepted > 0)
    report = {
        "model_sha256": digest(model_path),
        "metadata_sha256": digest(metadata_path),
        "manifest_sha256": digest(Path(args.manifest)),
        "decision_sha256": digest(repository / "ml" / "safety.py"),
        "mobile_decision_sha256": digest(repository / "mobile" / "src" / "lib" / "decision.ts"),
        "mobile_inference_sha256": digest(repository / "mobile" / "src" / "lib" / "inference.ts"),
        "gate_passed": passed,
        "risk": risk,
        "edible_specimens": edible,
        "edible_accepted": edible_accepted,
        "edible_coverage": edible_accepted / edible if edible else 0.0,
        "mushroom_cases": mushroom_cases,
        "unknown_or_uncertain_rate": unknown_or_uncertain / mushroom_cases if mushroom_cases else 0.0,
        "lookalike_poisonous_specimens": lookalike_poisonous,
        "lookalike_false_safe": lookalike_false_safe,
        "nonmushroom_specimens": nonmushroom,
        "nonmushroom_likely_edible": nonmushroom_edible,
        "unfamiliar_specimens": unfamiliar,
        "unfamiliar_likely_edible": unfamiliar_likely_edible,
        "per_poisonous_species": dict(per_poisonous_species),
        "per_lookalike_group": dict(per_lookalike_group),
        "decisions": decisions,
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "decisions"}, indent=2))


if __name__ == "__main__":
    main()
