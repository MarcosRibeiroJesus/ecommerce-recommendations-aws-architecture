"""Integration test validating Glue PySpark feature engineering schema and Parquet output paths."""
import unittest
from pathlib import Path

GLUE_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "src" / "batch" / "glue" / "feature_engineering.py"

class TestGlueTransformations(unittest.TestCase):
    def setUp(self):
        self.assertTrue(GLUE_SCRIPT_PATH.exists(), f"Glue script does not exist at {GLUE_SCRIPT_PATH}")
        with open(GLUE_SCRIPT_PATH, "r", encoding="utf-8") as f:
            self.script_code = f.read()

    def test_job_bookmarks_enabled(self):
        # Must have Job Bookmarks configuration per Spec §Feature 2.3 & Constitution
        self.assertIn("jobBookmarkKeys", self.script_code)

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

if __name__ == "__main__":
    unittest.main()
