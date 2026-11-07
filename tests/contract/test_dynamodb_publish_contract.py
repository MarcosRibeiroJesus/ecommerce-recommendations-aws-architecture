"""Contract and behavioral test validating DynamoDB batch publishing payload adheres to JSON contract and consumes training artifacts."""
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from src.batch.sagemaker.train_model import train
from src.batch.glue.publish_dynamodb import (
    build_dynamodb_batch_items,
    publish_batch_recommendations,
)

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "specs" / "001-aws-recommendation-platform" / "contracts" / "dynamodb-batch-recs-contract.json"
PUBLISHER_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "src" / "batch" / "glue" / "publish_dynamodb.py"


class TestDynamoDbPublishContract(unittest.TestCase):
    def setUp(self):
        with open(CONTRACT_PATH, "r", encoding="utf-8") as f:
            self.contract = json.load(f)
        with open(PUBLISHER_SCRIPT_PATH, "r", encoding="utf-8") as f:
            self.publisher_code = f.read()

    def test_ttl_calculation_is_7_days(self):
        # 7 days in seconds: 7 * 86400 = 604800
        self.assertIn("604800", self.publisher_code, "TTL must be set to 7 days (604800 seconds)")

    def test_schema_required_fields(self):
        required = self.contract["required"]
        self.assertEqual(required, ["userId", "generatedAt", "ttlTimestamp", "recommendations"])

    def test_sample_item_matches_contract(self):
        sample_item = {
            "userId": "u-user_9999",
            "generatedAt": 1730700000,
            "ttlTimestamp": 1730700000 + 604800,
            "recommendations": [
                {"itemId": "SKU-100", "score": 0.94, "rank": 1, "modelId": "cf-spot-v1"}
            ],
        }

        user_pattern = re.compile(self.contract["properties"]["userId"]["pattern"])
        self.assertTrue(user_pattern.match(sample_item["userId"]))
        self.assertGreaterEqual(sample_item["generatedAt"], 0)
        self.assertEqual(sample_item["ttlTimestamp"] - sample_item["generatedAt"], 604800)
        self.assertTrue(1 <= len(sample_item["recommendations"]) <= 50)

        first_rec = sample_item["recommendations"][0]
        self.assertTrue(0.0 <= first_rec["score"] <= 1.0)
        self.assertTrue(1 <= first_rec["rank"] <= 50)

    def test_end_to_end_training_to_dynamodb_publish(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            train_metrics = train(model_dir=tmp_dir, epochs=5, embedding_dim=128)
            self.assertGreater(train_metrics["users_scored"], 0)

            recs_artifact = Path(tmp_dir) / "user_recommendations.json"
            self.assertTrue(recs_artifact.exists())
            with open(recs_artifact, "r", encoding="utf-8") as f:
                raw_records = json.load(f)

            items = build_dynamodb_batch_items(raw_records, now_epoch=1730700000)
            self.assertGreater(len(items), 0)

            user_pattern = re.compile(self.contract["properties"]["userId"]["pattern"])
            for item in items:
                self.assertTrue(user_pattern.match(item["userId"]))
                self.assertEqual(item["ttlTimestamp"] - item["generatedAt"], 604800)
                self.assertTrue(1 <= len(item["recommendations"]) <= 50)
                for rec in item["recommendations"]:
                    self.assertTrue(0.0 <= float(rec["score"]) <= 1.0)
                    self.assertTrue(1 <= int(rec["rank"]) <= 50)

            mock_batch_writer = MagicMock()
            mock_table = MagicMock()
            mock_table.batch_writer.return_value.__enter__.return_value = mock_batch_writer
            mock_dynamodb = MagicMock()
            mock_dynamodb.Table.return_value = mock_table

            with patch("src.batch.glue.publish_dynamodb.boto3") as mock_boto3:
                mock_boto3.resource.return_value = mock_dynamodb
                result = publish_batch_recommendations(
                    table_name="test-user-recommendations",
                    artifact_path=str(recs_artifact),
                    dry_run=False,
                    batch_pause_seconds=0.0,
                )
                self.assertEqual(result["usersPublished"], len(items))
                self.assertEqual(mock_batch_writer.put_item.call_count, len(items))


if __name__ == "__main__":
    unittest.main()
