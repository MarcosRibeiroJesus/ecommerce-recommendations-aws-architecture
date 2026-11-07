"""Integration test validating Glue PySpark feature engineering schema, Parquet output paths, and behavioral feature aggregation."""
import json
import tempfile
import unittest
from pathlib import Path
from src.batch.glue.feature_engineering import (
    compute_interaction_features,
    run_feature_engineering,
)

GLUE_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "src" / "batch" / "glue" / "feature_engineering.py"


class TestGlueTransformations(unittest.TestCase):
    def setUp(self):
        self.assertTrue(GLUE_SCRIPT_PATH.exists(), f"Glue script does not exist at {GLUE_SCRIPT_PATH}")
        with open(GLUE_SCRIPT_PATH, "r", encoding="utf-8") as f:
            self.script_code = f.read()

    def test_job_bookmarks_enabled(self):
        # Must have Job Bookmarks configuration and transformation_ctx per Spec §Feature 2.3 & Constitution
        self.assertIn("jobBookmarkKeys", self.script_code)
        self.assertIn("create_dynamic_frame.from_catalog", self.script_code)
        self.assertIn("transformation_ctx", self.script_code)

    def test_broadcast_join_configured_for_g1x_workers(self):
        self.assertIn("F.broadcast(", self.script_code)

    def test_snappy_parquet_format_enforced(self):
        self.assertIn("snappy", self.script_code.lower())
        self.assertIn("parquet", self.script_code.lower())

    def test_partition_by_date_configured(self):
        # Partition pruning support by year, month, day
        self.assertTrue(
            "partitionBy" in self.script_code or "partition_keys" in self.script_code,
            "Partitioning strategy missing in Glue transformation output",
        )

    def test_required_feature_columns_present(self):
        required_cols = ["user_id", "item_id", "interaction_weight"]
        for col in required_cols:
            self.assertIn(col, self.script_code)

    def test_compute_interaction_features_aggregation(self):
        interactions = [
            {
                "event_id": "evt-1",
                "user_id": "u-100",
                "item_id": "SKU-1001",
                "event_type": "purchase",
                "timestamp": 1730700100,
            },
            {
                "event_id": "evt-2",
                "user_id": "u-100",
                "item_id": "SKU-1001",
                "event_type": "add_to_cart",
                "timestamp": 1730700050,
            },
            {
                "event_id": "evt-3",
                "user_id": "u-100",
                "item_id": "SKU-9999",
                "event_type": "click",
                "timestamp": 1730700200,
            },
        ]
        catalog = [
            {"item_id": "SKU-1001", "category_id": "Electronics", "price_cents": 19999, "in_stock": True},
            {"item_id": "SKU-9999", "category_id": "Electronics", "price_cents": 4999, "in_stock": False},
        ]

        features = compute_interaction_features(interactions, catalog)
        # Out-of-stock SKU-9999 must be excluded
        self.assertEqual(len(features), 1)
        row = features[0]
        self.assertEqual(row["user_id"], "u-100")
        self.assertEqual(row["item_id"], "SKU-1001")
        # purchase (5.0) + add_to_cart (3.0) = 8.0
        self.assertAlmostEqual(row["interaction_weight"], 8.0)
        self.assertEqual(row["interaction_count"], 2)
        self.assertEqual(row["last_event_ts"], 1730700100)

    def test_run_feature_engineering_writes_artifact(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_file = str(Path(tmp_dir) / "features.json")
            result = run_feature_engineering(
                s3_bucket="test-golden-bucket",
                output_prefix="user_features/version=v1/",
                local_output_path=out_file,
            )
            self.assertEqual(result["status"], "COMPLETED")
            self.assertGreater(result["featureRowCount"], 0)
            self.assertTrue(Path(out_file).exists())
            with open(out_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
            self.assertGreater(len(saved), 0)
            self.assertIn("interaction_weight", saved[0])


if __name__ == "__main__":
    unittest.main()
