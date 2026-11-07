# AWS Hybrid Recommendation Platform (E-Commerce)

An enterprise-grade, cost-optimized, and resilient **Hybrid Recommendation Platform** designed for Amazon.com e-commerce workloads. The platform harmonizes offline collaborative filtering in batch, real-time semantic retrieval via Redis vector search, and online ML re-ranking via SageMaker Serverless Inference.

---

## Architectural Highlights

- **11 Cloud-Native AWS Services**:
  - **Batch Layer**: Amazon S3 (Golden Dataset), AWS Lake Formation, Amazon Athena, AWS Glue 4.0, Amazon SageMaker (Managed Spot Training), Amazon DynamoDB (`user_recommendations`, On-Demand, 7-day TTL), Amazon MWAA (Airflow DAG).
  - **Realtime Layer**: Amazon MemoryDB for Redis (HNSW `item_idx`, 128-dim Float32 vectors), Amazon SageMaker Serverless Inference ($0 idle), Amazon ECS (Fargate Spot, Node.js 20 LTS / Fastify v4 / TypeScript).
  - **Ingress & Observability**: Application Load Balancer (ALB), Amazon CloudWatch.
- **Strict Clean Architecture (Hexagonal)**: Orchestration, candidate merging, and business filtering are completely decoupled from AWS SDK clients, enabling 100% offline local test execution without live cloud dependencies.
- **Operational Resilience (Zero Customer-Facing 500s)**: Built-in circuit breakers (`opossum`) and deterministic multi-tier fallbacks:
  1. *Healthy Hybrid*: DynamoDB batch candidates + MemoryDB semantic vectors + SageMaker scoring.
  2. *SageMaker Timeout (>35ms)*: In-memory weighted heuristic reranker (`(0.6 * batch) + (0.4 * vector)`), `degradedMode: true`.
  3. *MemoryDB Outage*: Pure DynamoDB batch recommendations with `provenance: 'batch'`.
  4. *DynamoDB Miss / Cold-Start*: Pure real-time semantic vectors with `provenance: 'realtime'`.
  5. *Catastrophic Outage*: Curated high-seller fallback catalog with `provenance: 'fallback'`.
- **Strict Business Governance**: 100% suppression of out-of-stock items (`in_stock: false`), products purchased within the last 30 days, restricted categories, and geo restrictions across both primary and degraded fallback paths.
- **Deterministic Session Vector Derivation**: Real-time session item signals (`sessionItemIds`) are deterministically projected into 128-dimensional L2-normalized `Float32Array` vectors for low-latency HNSW ANN retrieval in Amazon MemoryDB.

---

## Reference Architecture Diagram (Batch to Real-Time)

Modeled on [Building a scalable, personalized recommendation system on AWS: From batch to real-time](https://aws.amazon.com/pt/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/). See [`docs/ARCHITECTURE_DIAGRAM.md`](docs/ARCHITECTURE_DIAGRAM.md) for the full sequence diagram and component mapping.

```mermaid
flowchart TB
    User(["Amazon.com Shopper\n(userId, sessionItemIds, category, limit)"])

    subgraph Data_Lake ["1. Data Lake & Governance"]
        S3[("Amazon S3 Golden Dataset\nParquet + Snappy | SSE-KMS")] <--> LF["AWS Lake Formation\n& Glue Data Catalog"]
        LF --> Athena["Amazon Athena v3\nPartition-Pruned Views"]
    end

    subgraph Batch_Layer ["2. Offline Batch & ML Pipeline (MWAA Daily 02:00 UTC)"]
        MWAA["Amazon MWAA (Airflow)"]
        Athena --> GlueETL["AWS Glue 4.0: feature-engineering\n(Job Bookmarks + Broadcast Join)"]
        GlueETL --> SM_Train["Amazon SageMaker Spot Training\n(Two-Tower / CF Model)"]
        SM_Train -->|user_recommendations.json| GlueDDB["AWS Glue 4.0: publish-dynamodb"]
        SM_Train -->|item_embeddings_128dim.json| GlueMem["AWS Glue 4.0: publish-memorydb-vectors"]
        MWAA -.->|Orchestrates| Athena & GlueETL & SM_Train & GlueDDB & GlueMem
    end

    subgraph Serving_Layer ["3. Real-Time Hybrid Serving Layer (<60ms P95)"]
        ALB["Application Load Balancer"]
        ECR["Amazon ECR\n(Fastify Image)"] -.-> ECS["Amazon ECS Fargate Spot\n(Fastify v4 + x-api-key + Circuit Breakers)"]
        DynamoDB[("Amazon DynamoDB\nuser_recommendations (7d TTL)")]
        MemoryDB[("Amazon MemoryDB for Redis\nHNSW 128-dim Float32 (TLS + ACL)")]
        SM_Endpoint["Amazon SageMaker Endpoint\n(Serverless / ml.t3.medium)"]
        CW["Amazon CloudWatch\nLogs, EMF Metrics & Alarms"]
    end

    GlueDDB -->|Rate-Limited BatchWrite| DynamoDB
    GlueMem -->|Rate-Limited TLS HSET| MemoryDB
    User ==>|GET /v1/recommendations| ALB ==> ECS
    ECS -->|1a. Parallel GetItem| DynamoDB
    ECS -->|1b. Deterministic 128-dim Session Vector KNN| MemoryDB
    ECS -->|2. Merge, Deduplicate & Enforce 4 Business Rules| SM_Endpoint
    SM_Endpoint -->|3. Online Re-Ranking Scores (or 0.6/0.4 Fallback)| ECS
    ECS ==>|200 OK Ranked JSON| User
    ECS -.-> CW
```

---

## Documentation & Guides

- **[GitHub + AWS CI/CD Setup Guide (`docs/GITHUB_AWS_SETUP.md`)](docs/GITHUB_AWS_SETUP.md)**: Step-by-step instructions to configure AWS OIDC or Access Keys, all required GitHub Repository Secrets & Variables, and how to run the automated `ci.yml`, `terraform-create.yml`, and `terraform-destroy.yml` workflows.
- **[Post-Implementation Security Audit (`docs/SECURITY_AUDIT.md`)](docs/SECURITY_AUDIT.md)**: Verification of IAM ARN scoping, MemoryDB TLS + ACL, S3 KMS encryption, Lake Formation governance, API authentication (`x-api-key`), and production hardening roadmap.
- **[Reference Architecture & Sequence Diagrams (`docs/ARCHITECTURE_DIAGRAM.md`)](docs/ARCHITECTURE_DIAGRAM.md)**: Complete Batch-to-Real-Time architectural blueprint and sequence flow aligned with the AWS Big Data reference blog.

---

## Triple-Posture Budget Model

| Posture | Monthly Cost Target | Compute Strategy & Configuration |
| :--- | :---: | :--- |
| **Always-On Baseline** | ~$629.35/mo | 24/7 dedicated provisioned instances across all 11 AWS services. |
| **Serverless/Scheduled PoC** | ~$150 – $200/mo | MWAA suspended during off-hours, SageMaker Serverless Inference ($0 idle), Fargate Spot (70% savings), MemoryDB single-shard 0 replicas. |
| **On-Demand Ephemeral CI/CD** | **<$25/mo** | Spun up on-demand via GitHub Actions `terraform apply`, validated via automated test runners, and completely torn down via `terraform destroy` with `force_destroy = true`. |

---

## Project Structure

```text
.
├── src/
│   ├── serving/                     # Node.js 20 LTS / TypeScript Recommendation Microservice
│   │   ├── src/
│   │   │   ├── config/              # Zod environment variable parsing
│   │   │   ├── domain/              # Pure domain models (Candidate, Provenance, Filter Rules)
│   │   │   ├── application/         # Orchestration use cases (GetRecommendations, CandidateMerger, Reranker)
│   │   │   ├── infrastructure/      # AWS SDK adapters (DynamoDB, MemoryDB, SageMaker, Logging, Cache, Resilience)
│   │   │   └── presentation/        # Fastify HTTP server, routers, and health controllers
│   │   └── Dockerfile               # Production multi-stage Alpine container image
│   └── batch/                       # Python Batch & Data Pipelines
│       ├── athena/                  # Analytical SQL extraction with partition pruning
│       ├── glue/                    # Glue 4.0 PySpark ETL & DynamoDB/MemoryDB publishing
│       ├── sagemaker/               # Managed Spot training & 128-dim embedding generation
│       └── airflow/                 # MWAA DAG daily_hybrid_recommendation_pipeline
│
├── infra/
│   └── terraform/                   # Declarative Ephemeral Infrastructure as Code
│       ├── main.tf                  # Root orchestrator connecting all 11 AWS modules
│       └── modules/                 # Networking, S3, Lake Formation, DynamoDB, MemoryDB, SageMaker, ECS, MWAA, etc.
│
├── tests/                           # Exhaustive Automated Test Suites
│   ├── unit/                        # Domain logic, candidate merging, business filter engine, Airflow DAG
│   ├── contract/                    # OpenAPI 3.0 API schema, DynamoDB JSON contract, MemoryDB vector contract
│   └── integration/                 # End-to-end happy path & all 5 failure degradation modes
│
└── .github/
    └── workflows/                   # Automated CI & Ephemeral Terraform create/destroy pipelines
```

---

## Local Development & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suites
```bash
# Run TypeScript Unit, Contract, and Integration tests
npm test

# Run Python Batch Pipeline and Contract tests
python -m unittest discover -s tests
```

### 3. Build Serving Service
```bash
npm run build
```

---

## REST API Specification

### `GET /health`
Returns service health status and downstream connectivity checks.
```json
{
  "status": "UP",
  "timestamp": "2026-11-05T03:00:00.000Z",
  "downstream": {
    "dynamoDb": "CONNECTED",
    "memoryDb": "CONNECTED",
    "sageMaker": "CONNECTED"
  }
}
```

### `GET /v1/recommendations`
Query parameters:
- `userId` (*string, required*): Matching pattern `^[a-zA-Z0-9_-]+$`.
- `limit` (*integer, optional*): 1 to 50 (default: 10).
- `category` (*string, optional*): Filter candidate retrieval by catalog taxonomy.
- `sessionItemIds` (*string, optional*): Comma-separated product IDs to bias semantic search.

Example Response (`200 OK`):
```json
{
  "requestId": "req-9876543210",
  "userId": "u-12345",
  "timestamp": "2026-11-05T03:00:00.000Z",
  "degradedMode": false,
  "executionDurationMs": 42,
  "recommendations": [
    {
      "itemId": "SKU-9021",
      "rank": 1,
      "score": 0.945,
      "provenance": "hybrid",
      "title": "Wireless Noise-Canceling Over-Ear Headphones",
      "priceCents": 19999,
      "category": "Electronics > Audio > Headphones"
    }
  ]
}
```

---

## Ephemeral Cloud Deployment

To deploy the entire stack on AWS for validation:
```bash
cd infra/terraform
terraform init
terraform apply -auto-approve -var="environment=poc" -var="enable_serverless_inference=true"
```

To tear down all resources and guarantee zero idle cloud spend:
```bash
terraform destroy -auto-approve -var="environment=poc" -var="force_destroy=true"
```
