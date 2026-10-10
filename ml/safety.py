"""Specimen-level decision and the release gate; no ML packages required."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence


MIN_TOXIC_SPECIMENS = 2995
MAX_FALSE_SAFE_UPPER_95 = 0.001


@dataclass(frozen=True)
class Thresholds:
    presence: float = 0.5
    species_name: float = 0.65
    toxic: float = 0.95
    edible: float = 0.999
    edible_species: float = 0.99
    toxic_lookalike: float = 0.001


@dataclass(frozen=True)
class ViewScores:
    presence: float
    toxic: float
    species: tuple[float, ...]
    quality_pass: bool


@dataclass(frozen=True)
class Decision:
    kind: str
    species_id: str | None
    species_confidence: float | None
    toxic_probability: float | None
    reason: str


def decide(
    views: Sequence[ViewScores],
    species_ids: Sequence[str],
    toxicity_by_species: Mapping[str, str],
    *,
    release_gate_passed: bool,
    in_region: bool = True,
    thresholds: Thresholds = Thresholds(),
) -> Decision:
    if len(views) != 3 or any(len(v.species) != len(species_ids) for v in views):
        raise ValueError("Exactly three views and matching species scores are required")
    if any(not math.isfinite(v.presence) or not math.isfinite(v.toxic)
           or any(not math.isfinite(score) for score in v.species) for v in views):
        raise ValueError("Invalid scores")

    presence = sum(v.presence for v in views) / 3
    if presence < thresholds.presence:
        return Decision("notDetected", None, None, None, "No mushroom detected")

    toxic_probability = sum(v.toxic for v in views) / 3
    ranked = sorted(
        ((species_ids[i], sum(v.species[i] for v in views) / 3) for i in range(len(species_ids))),
        key=lambda item: item[1], reverse=True,
    )
    if toxic_probability >= thresholds.toxic:
        best = ranked[0] if ranked else None
        known = best is not None and best[1] >= thresholds.species_name and in_region
        return Decision("notSafe", best[0] if known else None,
                        best[1] if known else None, toxic_probability, "Strong poisonous evidence")
    if not ranked or ranked[0][1] < thresholds.species_name or not in_region:
        return Decision("unknown", None, None, toxic_probability, "Species unknown or out of region")

    species_id, species_confidence = ranked[0]
    if (toxicity_by_species.get(species_id) == "poisonous" and species_confidence >= thresholds.toxic) or toxic_probability >= thresholds.toxic:
        return Decision("notSafe", species_id, species_confidence, toxic_probability, "Poisonous evidence")

    winners = [max(range(len(v.species)), key=lambda i: v.species[i]) for v in views]
    views_agree = all(winner == winners[0] for winner in winners)
    toxic_lookalike = any(
        toxicity_by_species.get(item_id) == "poisonous" and confidence >= thresholds.toxic_lookalike
        for item_id, confidence in ranked
    )
    eligible = (
        release_gate_passed
        and toxicity_by_species.get(species_id) == "edible"
        and species_confidence >= thresholds.edible_species
        and 1 - toxic_probability >= thresholds.edible
        and views_agree
        and all(v.presence >= thresholds.presence for v in views)
        and all(v.quality_pass for v in views)
        and not toxic_lookalike
    )
    if eligible:
        return Decision("likelyEdible", species_id, species_confidence, toxic_probability, "All checks passed")
    return Decision("uncertain", species_id, species_confidence, toxic_probability, "Eating safety unverified")


def false_safe_upper_95(false_safe: int, poisonous_specimens: int) -> float:
    """Exact one-sided Clopper-Pearson upper bound via binomial CDF inversion."""
    if poisonous_specimens < 1 or not 0 <= false_safe <= poisonous_specimens:
        raise ValueError("Invalid specimen counts")
    if false_safe == poisonous_specimens:
        return 1.0
    if false_safe == 0:
        return 1 - 0.05 ** (1 / poisonous_specimens)

    def binomial_cdf(probability: float) -> float:
        logs = []
        for count in range(false_safe + 1):
            logs.append(
                math.lgamma(poisonous_specimens + 1)
                - math.lgamma(count + 1)
                - math.lgamma(poisonous_specimens - count + 1)
                + count * math.log(probability)
                + (poisonous_specimens - count) * math.log1p(-probability)
            )
        maximum = max(logs)
        return math.exp(maximum) * sum(math.exp(value - maximum) for value in logs)

    lower, upper = 0.0, 1.0
    for _ in range(70):
        midpoint = (lower + upper) / 2
        if binomial_cdf(midpoint) > 0.05:
            lower = midpoint
        else:
            upper = midpoint
    return upper


def release_gate(false_safe: int, poisonous_specimens: int) -> dict[str, float | int | bool]:
    upper = false_safe_upper_95(false_safe, poisonous_specimens) if poisonous_specimens else 1.0
    return {
        "false_safe": false_safe,
        "poisonous_specimens": poisonous_specimens,
        "false_safe_rate": false_safe / poisonous_specimens if poisonous_specimens else 0.0,
        "upper_95": upper,
        "required_poisonous_specimens": MIN_TOXIC_SPECIMENS,
        "passed": (
            false_safe == 0
            and poisonous_specimens >= MIN_TOXIC_SPECIMENS
            and upper <= MAX_FALSE_SAFE_UPPER_95
        ),
    }
