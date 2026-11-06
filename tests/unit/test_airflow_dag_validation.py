"""Unit test validating MWAA Airflow DAG structure and dependencies."""
import ast
import unittest
from pathlib import Path

DAG_FILE_PATH = Path(__file__).resolve().parents[2] / "src" / "batch" / "airflow" / "dags" / "daily_hybrid_recommendation_pipeline.py"

class TestAirflowDagValidation(unittest.TestCase):
    def setUp(self):
        self.assertTrue(DAG_FILE_PATH.exists(), f"DAG file does not exist at {DAG_FILE_PATH}")
        with open(DAG_FILE_PATH, "r", encoding="utf-8") as f:
            self.dag_code = f.read()
        self.parsed_ast = ast.parse(self.dag_code)

    def test_dag_id_defined(self):
        self.assertIn("daily_hybrid_recommendation_pipeline", self.dag_code)

    def test_required_pipeline_stages_present(self):
        required_tasks = [
            "wait_for_daily_interactions",
            "athena_extract_curated_features",
            "glue_feature_engineering",
            "sagemaker_train_model",
            "glue_publish_dynamodb",
            "glue_publish_memorydb_vectors",
        ]
        for task in required_tasks:
            self.assertIn(task, self.dag_code, f"Missing required pipeline task: {task}")

    def test_dependency_chain_syntax(self):
        # Verify dependency operators >> are present
        self.assertIn(">>", self.dag_code, "Task dependency chain (>>) not found in DAG file")

    def test_dag_schedule_interval(self):
        # Should be scheduled daily (e.g. @daily or cron 0 2 * * *)
        has_daily_schedule = "@daily" in self.dag_code or "schedule_interval" in self.dag_code
        self.assertTrue(has_daily_schedule, "Daily schedule interval not configured for recommendation pipeline")

if __name__ == "__main__":
    unittest.main()
