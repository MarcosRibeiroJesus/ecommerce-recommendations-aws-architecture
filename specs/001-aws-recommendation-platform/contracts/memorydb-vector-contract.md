# Amazon MemoryDB Vector Search Index & Query Contract

**Index Name**: `item_idx`  
**Storage Engine**: Amazon MemoryDB for Redis (Redis 7.1+ / RediSearch)  
**Key Prefix**: `item:<itemId>`  
**Key Data Type**: Redis `HASH`  

---

## 1. Index Definition Contract

```redis
FT.CREATE item_idx ON HASH
  PREFIX 1 item:
  SCHEMA
    v VECTOR HNSW 6
      TYPE FLOAT32
      DIM 128
      DISTANCE_METRIC COSINE
      M 16
      EF_CONSTRUCTION 64
    cat TAG
    price NUMERIC
    ts NUMERIC
```

### Parameters Rationale
- `DIM 128`: 128-dimensional dense float vector, serialized as 512 raw bytes (128 * 4 bytes).
- `DISTANCE_METRIC COSINE`: Cosine distance for normalized directional semantic embeddings.
- `M 16`: Max outgoing edges per node in the HNSW hierarchical graph (memory/accuracy balance).
- `EF_CONSTRUCTION 64`: Number of nearest neighbors evaluated during index insertion.

---

## 2. Ingestion / Upsert Contract

Each product vector is stored as a Redis hash key:

```redis
HSET item:SKU-9021 v <binary_512_bytes> cat "Electronics" price 19999 ts 1730689200
```

- Field `v`: Raw little-endian binary buffer of `Float32Array(128)`.
- Field `cat`: Category tag for filtered vector queries.
- Field `price`: Integer cents.
- Field `ts`: Timestamp of update.

---

## 3. Query Execution Contract

### 3.1 Unfiltered Top-K Vector Search
```redis
FT.SEARCH item_idx "*=>[KNN 50 @v $vec AS vector_score]"
  PARAMS 2 vec <binary_512_bytes>
  SORTBY vector_score ASC
  RETURN 1 vector_score
  DIALECT 2
```

### 3.2 Category-Filtered Vector Search
```redis
FT.SEARCH item_idx "(@cat:{Electronics})=>[KNN 50 @v $vec AS vector_score]"
  PARAMS 2 vec <binary_512_bytes>
  SORTBY vector_score ASC
  RETURN 1 vector_score
  DIALECT 2
```

---

## 4. Query Response Contract

The Redis client receives an array where:
- Index 0: Total number of matching documents (`integer`).
- Index 1: Key string (`item:SKU-9021`).
- Index 2: Array of returned attributes: `["vector_score", "0.0543"]` (where Cosine Distance = `1 - Cosine Similarity`).
- Subsequent pairs repeat for the remaining top candidates.

The Recommendation Service maps this into:
```typescript
interface SemanticCandidate {
  itemId: string;        // Extracted from key 'item:SKU-9021' -> 'SKU-9021'
  vectorScore: number;   // Calculated as 1.0 - parseFloat(vector_score)
}
```
