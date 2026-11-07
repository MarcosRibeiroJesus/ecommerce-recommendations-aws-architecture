"""Contract and behavioral test validating MemoryDB vector upsert parameters, byte formatting, and training artifact consumption."""
import json
import math
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from src.batch.sagemaker.train_model import train
from src.batch.glue.publish_memorydb_vectors import (
    build_memorydb_vector_payloads,
    publish_vectors_to_memorydb,
)

PUBLISHER_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "src" / "batch" / "glue" / "publish_memorydb_vectors.py"


class TestMemoryDbVectorContract(unittest.TestCase):
    def setUp(self):
        with open(PUBLISHER_SCRIPT_PATH, "r", encoding="utf-8") as f:
            self.publisher_code = f.read()

    def test_vector_dimension_is_128(self):
        self.assertIn("128", self.publisher_code)

    def test_vector_buffer_serialization(self):
        # 128 float32 values serialized as 512 bytes
        dummy_vector = [0.1] * 128
        serialized = struct.pack(f"{len(dummy_vector)}f", *dummy_vector)
        self.assertEqual(len(serialized), 512, "128-dim Float32 vector must serialize to exactly 512 bytes")

    def test_key_prefix_and_fields(self):
        self.assertIn("item:", self.publisher_code)
        self.assertIn("item_idx", self.publisher_code)

    def test_end_to_end_training_to_memorydb_publish(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            train_metrics = train(model_dir=tmp_dir, epochs=5, embedding_dim=128)
            self.assertGreater(train_metrics["items_embedded"], 0)

            emb_artifact = Path(tmp_dir) / "item_embeddings_128dim.json"
            self.assertTrue(emb_artifact.exists())
            with open(emb_artifact, "r", encoding="utf-8") as f:
                raw_embeddings = json.load(f)

            payloads = build_memorydb_vector_payloads(raw_embeddings, now_epoch=1730700000)
            self.assertEqual(len(payloads), len(raw_embeddings))

            for entry in payloads:
                self.assertTrue(entry["redis_key"].startswith("item:"))
                vec_bytes = entry["mapping"]["embedding"]
                self.assertEqual(len(vec_bytes), 512)
                unpacked = struct.unpack("128f", vec_bytes)
                l2_norm = math.sqrt(sum(v * v for v in unpacked))
                self.assertAlmostEqual(l2_norm, 1.0, places=4)

            mock_pipe = MagicMock()
            mock_redis_instance = MagicMock()
            mock_redis_instance.pipeline.return_value = mock_pipe

            with patch("src.batch.glue.publish_memorydb_vectors.redis") as mock_redis_mod:
                mock_redis_mod.Redis.return_value = mock_redis_instance
                result = publish_vectors_to_memorydb(
                    host="test-memorydb.cluster.amazonaws.com",
                    port=6379,
                    artifact_path=str(emb_artifact),
                    tls_enabled=True,
                    dry_run=False,
                    chunk_pause_seconds=0.0,
                )
                self.assertEqual(result["vectorsPublished"], len(payloads))
                self.assertTrue(result["tlsEnabled"])
                self.assertEqual(mock_pipe.hset.call_count, len(payloads))


if __name__ == "__main__":
    unittest.main()
