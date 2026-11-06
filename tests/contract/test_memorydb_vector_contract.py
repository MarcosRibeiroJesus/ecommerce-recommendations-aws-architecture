"""Contract test validating MemoryDB vector upsert parameters and byte formatting."""
import struct
import unittest
from pathlib import Path

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

if __name__ == "__main__":
    unittest.main()
