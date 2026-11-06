"""MemoryDB Vector Publisher Script.
Indexes 128-dim Float32 binary embeddings into Amazon MemoryDB for Redis (item_idx).
"""
import struct
import time
import redis

def publish_vectors_to_memorydb(host="localhost", port=6379):
    print(f"Connecting to MemoryDB Redis at {host}:{port}")
    r = redis.Redis(host=host, port=port, decode_responses=False)

    # Ensure HNSW vector search index item_idx exists
    try:
        r.execute_command("FT.INFO", "item_idx")
        print("Vector index item_idx already exists.")
    except Exception:
        print("Creating HNSW vector index item_idx...")
        create_cmd = [
            "FT.CREATE", "item_idx", "ON", "HASH",
            "PREFIX", "1", "item:",
            "SCHEMA",
            "v", "VECTOR", "HNSW", "6",
            "TYPE", "FLOAT32",
            "DIM", "128",
            "DISTANCE_METRIC", "COSINE",
            "M", "16",
            "EF_CONSTRUCTION", "64",
            "cat", "TAG",
            "price", "NUMERIC",
            "ts", "NUMERIC",
        ]
        try:
            r.execute_command(*create_cmd)
        except Exception as e:
            print(f"Index creation notice: {e}")

    now = int(time.time())

    # Generate and publish 128-dim vectors
    pipe = r.pipeline()
    for i in range(1, 51):
        item_id = f"SKU-{9000 + i}"
        key = f"item:{item_id}"

        # 128 float32 values serialized as 512 bytes
        dummy_vec = [float((i * 0.01 + dim * 0.005) % 1.0) for dim in range(128)]
        binary_vector = struct.pack("128f", *dummy_vec)

        category = "Electronics" if i % 2 == 0 else "Accessories"
        price_cents = 1000 + (i * 250)

        pipe.hset(
            key,
            mapping={
                b"v": binary_vector,
                b"cat": category.encode("utf-8"),
                b"price": str(price_cents).encode("utf-8"),
                b"ts": str(now).encode("utf-8"),
            },
        )

    pipe.execute()
    print("Successfully indexed 50 128-dim product vectors into MemoryDB index item_idx.")

if __name__ == "__main__":
    publish_vectors_to_memorydb()
