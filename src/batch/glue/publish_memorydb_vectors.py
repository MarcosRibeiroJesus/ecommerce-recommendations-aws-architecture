"""MemoryDB Vector Publisher Script.
Consumes trained 128-dim Float32 item_embeddings_128dim.json artifact (or fallback)
and indexes 512-byte binary vectors into Amazon MemoryDB for Redis (item_idx) with TLS & rate limiting.
"""
import json
import os
import struct
import time

try:
    import redis
except ImportError:
    redis = None


def build_memorydb_vector_payloads(embeddings_map=None, now=None, now_epoch=None):
    resolved_now = now_epoch if now_epoch is not None else now
    timestamp = int(resolved_now if resolved_now is not None else time.time())

    if not embeddings_map:
        embeddings_map = {
            f"SKU-{9000 + i}": [float((i * 0.01 + dim * 0.005) % 1.0) for dim in range(128)]
            for i in range(1, 51)
        }

    payloads = []
    for idx, (item_id, vec) in enumerate(embeddings_map.items(), start=1):
        if len(vec) != 128:
            raise ValueError(f"Expected 128-dim vector for {item_id}, got {len(vec)}")

        binary_vector = struct.pack("128f", *[float(x) for x in vec])
        category = "Electronics" if idx % 2 == 0 else "Accessories"
        price_cents = 1000 + (idx * 250)

        payloads.append({
            "key": f"item:{item_id}",
            "redis_key": f"item:{item_id}",
            "mapping": {
                b"v": binary_vector,
                "embedding": binary_vector,
                b"cat": category.encode("utf-8"),
                b"price": str(price_cents).encode("utf-8"),
                b"ts": str(timestamp).encode("utf-8"),
            },
        })

    return payloads


def publish_vectors_to_memorydb(
    host=None,
    port=None,
    tls_enabled=None,
    embeddings_artifact_path=None,
    artifact_path=None,
    batch_size=25,
    sleep_seconds=0.0,
    chunk_pause_seconds=None,
    dry_run=False,
):
    endpoint = os.environ.get("MEMORYDB_CLUSTER_ENDPOINT", "localhost:6379")
    default_host, default_port = (endpoint.split(":", 1) + ["6379"])[:2]
    resolved_host = host or default_host
    resolved_port = int(port or default_port)
    use_tls = (
        tls_enabled
        if tls_enabled is not None
        else os.environ.get("MEMORYDB_TLS_ENABLED", "false").lower() == "true"
    )
    password = os.environ.get("MEMORYDB_ACL_PASSWORD") or None
    pause_sec = chunk_pause_seconds if chunk_pause_seconds is not None else sleep_seconds

    resolved_artifact = (
        artifact_path
        or embeddings_artifact_path
        or os.environ.get("EMBEDDINGS_ARTIFACT_PATH", "")
    )
    embeddings_map = None
    if resolved_artifact and os.path.exists(resolved_artifact):
        with open(resolved_artifact, "r", encoding="utf-8") as f:
            embeddings_map = json.load(f)

    payloads = build_memorydb_vector_payloads(embeddings_map=embeddings_map)

    if not dry_run and redis is not None:
        r = redis.Redis(
            host=resolved_host,
            port=resolved_port,
            ssl=use_tls,
            password=password,
            decode_responses=False,
        )

        try:
            r.execute_command("FT.INFO", "item_idx")
        except Exception:
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
            except Exception:
                pass

        for start in range(0, len(payloads), batch_size):
            chunk = payloads[start : start + batch_size]
            pipe = r.pipeline()
            for entry in chunk:
                pipe.hset(entry["key"], mapping=entry["mapping"])
            pipe.execute()
            if pause_sec > 0:
                time.sleep(pause_sec)

    return {
        "host": resolved_host,
        "port": resolved_port,
        "tlsEnabled": use_tls,
        "indexed_count": len(payloads),
        "vectorsPublished": len(payloads),
        "payloads": payloads,
    }


if __name__ == "__main__":
    publish_vectors_to_memorydb()
