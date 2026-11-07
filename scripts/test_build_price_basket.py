"""Tests for the Precios archive fallback data. Run with `python3 -m unittest discover -s scripts`."""

import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("build_price_basket", Path(__file__).with_name("build-price-basket.py"))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

PRODUCTS = {
    "7790000000001": {
        "9": {"banners": {"1": 1000.4, "2": 1100.5, "3": 1200.0}},
        "12": {"banners": {"1": 900.0}},
        "10": {"banners": {"1": 800.0}},
    },
    "7790000000002": {"15": {"banners": {"1": 500.0}}},
    "7790000000003": {"15": {"banners": {"1": 1.0}}},
}

# Carrefour (commerce 10) has no live branches, so a location's list never names it.
BRANCHES = {"caba": ["9-1-10", "9-1-11", "9-2-2", "12-1-159", "15-1-454"], "ushuaia": []}


class ArchiveFallbackTest(unittest.TestCase):
    def setUp(self):
        self.fallback = build.archive_fallback(PRODUCTS, {"7790000000001", "7790000000002"}, BRANCHES)

    def test_prices_are_per_commerce_and_banner_rounded_to_pesos(self):
        self.assertEqual(
            self.fallback["prices"]["7790000000001"],
            {"10-1": 800, "12-1": 900, "9-1": 1000, "9-2": 1100, "9-3": 1200},
        )

    def test_only_requested_gtins_are_kept(self):
        self.assertEqual(sorted(self.fallback["prices"]), ["7790000000001", "7790000000002"])

    def test_banners_come_from_live_branches_once_each(self):
        self.assertEqual(self.fallback["banners"]["caba"], ["12-1", "15-1", "9-1", "9-2"])
        self.assertEqual(self.fallback["banners"]["ushuaia"], [])

    def test_a_commerce_without_live_branches_is_never_shown_for_a_location(self):
        shown = [banner for banner in self.fallback["banners"]["caba"] if banner in self.fallback["prices"]["7790000000001"]]

        self.assertNotIn("10-1", shown)


if __name__ == "__main__":
    unittest.main()
