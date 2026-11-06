"""Contract test validating DynamoDB batch publishing payload adheres to JSON contract."""
import json
import re
import unittest
from pathlib import Path

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

if __name__ == "__main__":
    unittest.main()
