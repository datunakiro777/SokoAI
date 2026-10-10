import unittest

from ml.safety import Thresholds, ViewScores, decide, false_safe_upper_95, release_gate


SPECIES = ["toxic", "edible"]
TOXICITY = {"toxic": "poisonous", "edible": "edible"}


def three_views(presence=0.999, toxic=0.0001, species=(0.0001, 0.9999), quality=True):
    return [ViewScores(presence, toxic, species, quality) for _ in range(3)]


class SafetyTests(unittest.TestCase):
    def test_not_detected(self):
        result = decide(three_views(presence=0.1), SPECIES, TOXICITY, release_gate_passed=True)
        self.assertEqual(result.kind, "notDetected")

    def test_unknown_species(self):
        result = decide(three_views(species=(0.5, 0.5)), SPECIES, TOXICITY, release_gate_passed=True)
        self.assertEqual(result.kind, "unknown")

    def test_poisonous_species_is_not_safe(self):
        result = decide(three_views(toxic=0.01, species=(0.99, 0.01)), SPECIES, TOXICITY, release_gate_passed=True)
        self.assertEqual(result.kind, "notSafe")

    def test_release_gate_disables_edible(self):
        result = decide(three_views(), SPECIES, TOXICITY, release_gate_passed=False)
        self.assertEqual(result.kind, "uncertain")

    def test_toxic_lookalike_blocks_edible(self):
        result = decide(three_views(species=(0.002, 0.998)), SPECIES, TOXICITY, release_gate_passed=True)
        self.assertEqual(result.kind, "uncertain")

    def test_validated_edible_can_pass(self):
        result = decide(three_views(), SPECIES, TOXICITY, release_gate_passed=True)
        self.assertEqual(result.kind, "likelyEdible")

    def test_poor_photo_blocks_edible(self):
        result = decide(three_views(quality=False), SPECIES, TOXICITY, release_gate_passed=True)
        self.assertEqual(result.kind, "uncertain")

    def test_zero_errors_need_about_three_thousand_independent_toxic_specimens(self):
        self.assertFalse(release_gate(0, 2994)["passed"])
        self.assertTrue(release_gate(0, 2995)["passed"])
        self.assertAlmostEqual(false_safe_upper_95(0, 2995), 0.001, places=6)

    def test_any_false_safe_blocks_release(self):
        self.assertFalse(release_gate(1, 10000)["passed"])


if __name__ == "__main__":
    unittest.main()
