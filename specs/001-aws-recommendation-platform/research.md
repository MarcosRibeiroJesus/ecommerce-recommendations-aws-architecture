# Phase 0 Research: AWS Hybrid Recommendation Platform

**Feature**: AWS Hybrid Recommendation Platform  
**Branch**: `001-aws-recommendation-platform`  
**Status**: Completed  
**Author**: Principal Solutions Architect, Staff ML Engineer, Staff Platform Engineer  

---

## 1. Executive Summary of Research Decisions

The architecture combines offline batch recommendation precomputation with real-time vector candidate retrieval, dynamic ML scoring, and business-rule filtering. All architectural components are approved and fixed:
- **Batch Layer**: Amazon S3 (Golden Dataset), AWS Lake Formation (Governance), Amazon MWAA (Airflow DAGs), Amazon Athena (Analytical Queries), AWS Glue (ETL & Publishing), Amazon SageMaker (Training & Batch Transform), Amazon DynamoDB (Batch Recs Store).
- **Realtime Layer**: Amazon MemoryDB (Vector Search Index), Amazon SageMaker Endpoint (Online Inference), Amazon ECS (Fargate Service).

The research focuses on the optimal runtimes, SDK patterns, connection topologies, fallback mechanics, and cost optimization configurations to ensure implementation readiness.

---

## 2. Research Findings & Decision Log

### Decision 1: Recommendation Service Microservice Framework & Architecture

- **Decision**: Node.js 20 LTS with TypeScript and Fastify, organized under strict Clean Architecture (Domain, Use Cases, Adapters, Infrastructure).
- **Rationale**:
  - Fastify provides ultra-low latency routing (<1ms overhead) and built-in JSON schema validation (via Ajv), which is essential to meet the <60ms P95 API latency budget.
  - Node.js event-driven non-blocking I/O is ideal for executing concurrent I/O calls to DynamoDB and MemoryDB in parallel (`Promise.allSettled`).
  - Strict hexagonal/clean architecture decouples the core recommendation orchestration engine (candidate merging, deduplication, business rule filtering, and heuristic re-ranking) from AWS SDK clients. This allows 100% of domain logic and fallback state machines to be unit-tested without live AWS credentials or active network calls.
- **Alternatives Considered**:
  - *Express.js*: High adoption, but 2-3x slower request routing overhead compared to Fastify.
  - *Python (FastAPI)*: Excellent for ML serving, but higher memory footprint per container and slower concurrent I/O throughput compared to Node.js for high-QPS API gateway orchestrators.

---

### Decision 2: Amazon MemoryDB Vector Search Integration & Query Pattern

- **Decision**: Connect via `ioredis` with clustered client configuration, executing `FT.SEARCH` commands over Redis RESP3 protocol using 128-dimensional Float32 byte buffers.
- **Rationale**:
  - MemoryDB with Vector Search supports Redis 7.1+ RediSearch commands (`FT.CREATE`, `FT.SEARCH`).
  - Encoding float vectors into raw binary buffers (`Buffer.from(new Float32Array(embedding).buffer)`) avoids string serialization overhead and ensures maximum network throughput.
  - KNN query pattern:
    ```text
    FT.SEARCH item_idx "(*)=>[KNN 50 @v $vec AS vector_score]" PARAMS 2 vec <binary_buffer> SORTBY vector_score ASC DIALECT 2
    ```
  - MemoryDB clusters require cluster-aware clients. `ioredis` handles cluster topology discovery, slot redirection, and connection pooling.
- **Cost & Sizing Decision**:
  - `db.t4g.small` (1.37 GB RAM) handles up to 100,000 128-dim vectors with HNSW M=16, EF_CONSTRUCTION=64 while consuming less than 250 MB RAM.
  - 0 replicas configured for MVP/PoC, cutting base cost from $144/mo to $72.08/mo.
- **Alternatives Considered**:
  - *OpenSearch*: Dedicated OpenSearch cluster costs >$150/month and has higher query latency (20-40ms vs sub-5ms in MemoryDB).
  - *pgvector on Aurora Serverless*: Slower cold starts and higher query latency under continuous concurrent load.

---

### Decision 3: SageMaker Inference Deployment Posture (Serverless Inference vs Real-Time)

- **Decision**: Adopt **Amazon SageMaker Serverless Inference** (Memory: 2048 MB, MaxConcurrency: 5) for MVP/PoC workloads, with automatic fallback to heuristic sorting in the Recommendation Service.
- **Rationale**:
  - A 24/7 provisioned `ml.t3.medium` endpoint costs $39.13/month even with zero requests.
  - SageMaker Serverless Inference charges strictly per millisecond of compute duration ($0.000020/second for 2048 MB), resulting in **$0 idle cost**. For ~5,000 test requests/month, total cost is **<$1.00/month**.
  - Cold starts (~1.5s on initial wake) are safely absorbed by the Recommendation Service's 35ms timeout circuit breaker, which automatically degrades to heuristic candidate sorting (`(0.6 * batchScore) + (0.4 * vectorScore)`) without throwing 500 errors to the client.
- **Production Path**: For sustained production traffic (>100 RPS), transition to a multi-AZ Real-Time Endpoint using `ml.c6i.xlarge` instances with target tracking autoscaling.
- **Alternatives Considered**:
  - *Always-on ml.t3.medium*: Wastes $39/mo on idle compute during development cycles.
  - *SageMaker Asynchronous Inference*: Meant for large payloads (up to 1 GB) and long-running jobs (up to 1 hour), unsuitable for real-time <60ms recommendation serving.

---

### Decision 4: DynamoDB Batch Retrieval Pattern & Local In-Memory Cache

- **Decision**: Use AWS SDK v3 `@aws-sdk/lib-dynamodb` with `GetItemCommand`, `ProjectionExpression`, and an in-memory bounded LRU cache (1,000 items, 60s TTL) in the ECS container.
- **Rationale**:
  - The DynamoDB Document Client automatically marshals/unmarshals JavaScript objects to DynamoDB AttributeValues.
  - Point read (`GetItem`) on Partition Key `userId` provides single-digit millisecond latency (3-5ms P95).
  - Specifying `ProjectionExpression = "recommendations, generatedAt"` avoids transferring unnecessary metadata attributes, minimizing Read Capacity Unit (RCU) consumption.
  - Local in-memory LRU cache absorbs repeat rapid queries (such as client page refreshes or quick clicks), cutting DynamoDB RCU consumption by ~25% at 0 additional cost.
- **Billing Mode**: `PAY_PER_REQUEST` (On-Demand) mode guarantees zero provisioned capacity waste. 1 GB table storage is 100% covered under DynamoDB's permanent 25 GB Free Tier.
- **Alternatives Considered**:
  - *DynamoDB Accelerator (DAX)*: Adds a minimum ~$40/month cluster cost, which is completely unnecessary when DynamoDB point reads already respond in <5ms.

---

### Decision 5: Amazon MWAA Ephemeral Lifecycle & Cost Management (The 71.2% Cost Driver)

- **Decision**: Parameterize MWAA in Terraform for automated ephemeral provisioning and teardown via GitHub Actions, combined with off-hours scheduling.
- **Rationale**:
  - Analysis of the AWS cost model revealed that MWAA represents 71.2% ($447.90/month) of total 24/7 PoC infrastructure expenses because `mw1.small` runs schedulers and webservers 24/7 (~$0.49/hour base).
  - For a PoC batch pipeline that runs once daily or on-demand during active sprints, running MWAA 24/7 violates the core Constitution principle of minimum-cost PoC posture.
  - By managing MWAA via Terraform create/destroy workflows, cloud spend drops from $447.90/mo to **<$20-$30/mo** (paying only for active verification hours).
- **Architectural Trade-Off Analysis**:
  - If future architectural reviews permit orchestrator substitution, replacing MWAA with **AWS Step Functions + EventBridge Scheduler** reduces orchestration cost to **<$2.00/month** (AWS Free Tier covers 4,000 state transitions/month). MWAA is retained in this specification to preserve the approved architecture.
- **Alternatives Considered**:
  - *Running MWAA 24/7*: Discarded due to $447.90/month unnecessary idle expense.

---

### Decision 6: AWS Glue ETL Feature Engineering & Incremental Bookmarks

- **Decision**: AWS Glue 4.0 runtime (Apache Spark 3.3 / Python 3.10) with `G.1X` worker type (2 DPUs) and Job Bookmarks enabled.
- **Rationale**:
  - Glue Job Bookmarks track source S3 object commit timestamps, ensuring subsequent daily runs only ingest and transform newly landed interaction logs.
  - Allocating 2 DPUs (1 driver, 1 executor) represents the minimum viable compute footprint for AWS Glue, ensuring daily feature generation runs cost ~$0.88/run (~$26.40/month for daily execution).
  - Standard worker timeout set to 30 minutes prevents zombie jobs from consuming DPUs indefinitely.
- **Alternatives Considered**:
  - *Amazon EMR on EC2*: Requires maintaining cluster nodes or waiting 5-10 minutes for EMR cluster provisioning, with higher operational management overhead.

---

### Decision 7: Model Training & Embedding Dimensionality Strategy

- **Decision**:
  - Collaborative filtering / two-tower model trained on Amazon SageMaker Managed Spot Instances (`train_use_spot_instances = true`) with automated S3 checkpoints.
  - Item catalog embeddings standardized on **128-dimensional dense float vectors**.
- **Rationale**:
  - Managed Spot Instances offer up to a 70% discount off On-Demand pricing. Checkpointing every 15 minutes guarantees training resumes smoothly upon any Spot interruption.
  - 128-dimensional embeddings provide an optimal balance between semantic capture and memory efficiency. Compared to 768-dim embeddings, 128 dims reduce MemoryDB RAM usage and network transmission payloads by 83%, keeping the entire 50,000 item catalog index under 250 MB RAM.
- **Alternatives Considered**:
  - *768-dim or 1536-dim embeddings*: Overkills memory requirements for e-commerce category/title semantic search, forcing larger, expensive MemoryDB instances (`db.r6g.large`).

---

## 3. Technology Stack Summary

| Layer | Technology / Tool | Version / SKU | Primary Role |
| :--- | :--- | :--- | :--- |
| **Serving Microservice** | Node.js / TypeScript | Node.js 20 LTS, TS 5.x | High-throughput async orchestration |
| **HTTP Framework** | Fastify | v4.x | Sub-millisecond routing & schema validation |
| **Container Compute** | Amazon ECS (Fargate Spot) | 0.5 vCPU, 1 GB RAM | Low-cost container hosting (70% spot savings) |
| **Vector Database** | Amazon MemoryDB | Redis 7.1+, `db.t4g.small` | In-memory HNSW vector search (<10ms) |
| **Batch Store** | Amazon DynamoDB | On-Demand (PAY_PER_REQUEST) | Sub-5ms point lookup for precomputed recs |
| **ML Inference** | SageMaker Serverless Inference | 2048 MB, MaxConcurrency: 5 | Real-time candidate scoring ($0 idle cost) |
| **Orchestration** | Amazon MWAA | `mw1.small`, Airflow 2.8+ | Batch workflow coordination |
| **ETL & Data Prep** | AWS Glue | Glue 4.0 (Spark 3.3), 2 DPUs | Incremental feature engineering |
| **Analytical Query** | Amazon Athena | Athena Engine v3 | Serverless SQL dataset extraction |
| **Storage & Lake** | Amazon S3 & Lake Formation | Parquet / Snappy, LF-Tags | Curated golden dataset & governance |
| **IaC & Automation** | Terraform & GitHub Actions | Terraform >= 1.5 | Declarative create/destroy lifecycle |
