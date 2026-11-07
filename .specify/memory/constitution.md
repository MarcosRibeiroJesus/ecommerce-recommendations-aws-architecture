<!--
Sync Impact Report
- Version change: N/A (unpopulated template) → 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. AWS Cloud-Native & Minimum-Cost PoC Posture (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Clean Architecture & Hybrid Recommendation Modularity
  - [PRINCIPLE_3_NAME] → III. Test-First & Exhaustive Edge-Case Proof (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Operational Resilience, Graceful Fallback & Observability
  - [PRINCIPLE_5_NAME] → V. Reproducible & Ephemeral Infrastructure as Code (Terraform & GitHub Actions)
- Added principles/sections:
  - VI. Pragmatic Simplicity & YAGNI
  - Architecture & Technology Stack Constraints (replaces [SECTION_2_NAME])
  - Development Workflow, Quality Gates & Ephemeral Lifecycle (replaces [SECTION_3_NAME])
- Removed sections: None
- Follow-up TODOs: None
-->
# E-Commerce Hybrid Recommendation Platform (AWS PoC) Constitution

## Core Principles

### I. AWS Cloud-Native & Minimum-Cost PoC Posture (NON-NEGOTIABLE)
Every architectural and infrastructure decision MUST prioritize the lowest-cost (or Free Tier
eligible) AWS instance types, SKUs, and service configurations capable of demonstrating the full
end-to-end Hybrid Recommendation Platform as a Proof of Concept (PoC).
- Provisioned resources (ECS tasks, MemoryDB nodes, SageMaker training/inference endpoints, Glue
  DPUs, MWAA environments, DynamoDB capacity) MUST default to the smallest viable compute/memory
  footprint, on-demand/serverless billing where cheaper, or spot/burstable instances.
- Expensive long-running resources (such as MWAA, MemoryDB, and SageMaker Endpoints) MUST be
  parameterized in Terraform so they can be spun up on demand for verification and immediately
  destroyed afterward, or substituted with lightweight local/mock adapters during rapid iteration.
- Rationale: The goal is a functional, production-representative architectural PoC where all AWS
  building blocks work together without incurring unnecessary cloud spend.

### II. Clean Architecture & Hybrid Recommendation Modularity
The codebase MUST enforce strict separation of concerns between domain logic, machine-learning
scoring/retrieval adapters, data pipelines, and AWS infrastructure bindings.
- The Recommendation Service (Node.js/TypeScript on ECS) MUST isolate core orchestration logic
  (candidate retrieval, merging, business rule filtering, and reranking) from infrastructure clients
  (DynamoDB, MemoryDB Vector Search, SageMaker Runtime).
- Batch pipeline jobs (Athena queries, AWS Glue ETL/feature engineering, SageMaker training and
  embedding generation) MUST have explicit, versioned input/output data contracts.
- Rationale: Decoupling orchestration rules from AWS SDK calls guarantees that every pipeline stage
  and ranking priority can be independently tested, reasoned about, and verified.

### III. Test-First & Exhaustive Edge-Case Proof (NON-NEGOTIABLE)
All functional requirements and failure modes MUST be backed by automated tests before or alongside
implementation to demonstrably prove both happy-path functionality and edge-case handling.
- Unit, contract, and integration tests MUST cover the 7-step Request Execution Flow and all 5
  Decision Priorities (1: User relevance, 2: Model confidence score, 3: Semantic similarity,
  4: Business objectives & eligibility constraints, 5: Diversity & coverage).
- Tests MUST explicitly prove every operational edge case:
  1. Full hybrid flow (DynamoDB batch + MemoryDB semantic vectors + SageMaker scoring).
  2. Realtime service degradation (MemoryDB or SageMaker unavailable → graceful fallback to batch).
  3. Batch cache miss/unavailability (DynamoDB empty/unavailable → fallback to vector retrieval +
     model scoring).
  4. Strict business constraint enforcement (ineligible or filtered items MUST NEVER leak into the
     final response regardless of score).
  5. Malformed payloads, cold-start users, and empty candidate sets.
- Rationale: A PoC architecture is only credible when every happy path, fallback transition, and
  boundary condition is provably verified via automated test suites.

### IV. Operational Resilience, Graceful Fallback & Observability
The recommendation orchestration engine MUST remain available and return the highest-confidence
recommendation set possible even when upstream dependencies fail or degrade.
- The service MUST always attempt batch retrieval (DynamoDB) first, augment with realtime semantic
  candidates (MemoryDB Vector Search), score via SageMaker Endpoint when accessible, apply business
  filters before final reranking, and tag each returned item with its provenance
  (`batch`, `realtime`, or `hybrid`).
- All components MUST emit structured JSON logs including correlation/request IDs, latency metrics
  per stage, fallback triggers activated, and candidate counts before/after business filtering.
- Rationale: Hybrid ML systems depend on multiple distributed stores and inference endpoints;
  deterministic degradation and clear telemetry are mandatory to diagnose behavior and prove SLAs.

### V. Reproducible & Ephemeral Infrastructure as Code (Terraform & GitHub Actions)
All cloud infrastructure MUST be declaratively defined using Terraform only (no manual console
provisioning or mixed IaC tools) and automated via GitHub Actions workflows.
- The repository MUST maintain dedicated GitHub Actions workflows to **create/apply** and
  **destroy** the entire AWS infrastructure stack reliably and idempotently.
- Every Terraform module MUST support teardown without orphaned billing artifacts (e.g., S3 buckets
  configured with `force_destroy = true` for PoC datasets, ECR cleanup, CloudWatch log retention
  limits, and automated endpoint deletion).
- Rationale: Automated create/destroy pipelines guarantee reproducibility while enforcing near-zero
  idle cloud costs when the PoC is not actively being demonstrated.

### VI. Pragmatic Simplicity & YAGNI
Implementation MUST focus strictly on proving the Hybrid Recommendation Platform architecture
without speculative abstractions or enterprise bloat unrelated to the PoC objectives.
- Keep data schemas, UI/frontend harnesses, and pipeline scripts concise, self-documented, and
  focused on demonstrating the batch-to-realtime recommendation lifecycle.
- Rationale: Maintaining a lean codebase accelerates learning, debugging, and architectural
  verification.

## Architecture & Technology Stack Constraints

- **Primary Application Stack**: Node.js with TypeScript for the ECS Recommendation Service, API
  contracts, test suites, and web/client demonstration harness; Python where required for AWS Glue
  ETL jobs, Airflow (MWAA) DAGs, and SageMaker model/embedding scripts.
- **Batch Knowledge Layer**:
  - **Data Source**: Amazon S3 Golden Dataset.
  - **Data Governance**: AWS Lake Formation.
  - **Orchestration**: Amazon MWAA (Apache Airflow).
  - **Processing Pipeline**: Amazon Athena (curated dataset queries), AWS Glue (ETL, feature
    engineering, data preparation, and artifact publishing), and Amazon SageMaker (model training
    and embedding generation).
  - **Published Outputs**: Amazon DynamoDB (precomputed low-latency batch recommendations) and
    Amazon MemoryDB Vector Search Index (embeddings for semantic similarity search).
- **Realtime Serving Layer**:
  - **Compute**: Amazon ECS (Fargate Spot / smallest task size for PoC) running the Recommendation
    Service.
  - **Vector Retrieval**: Amazon MemoryDB Vector Search Index (`t4g.small` or minimum supported
    vector-capable node).
  - **Inference**: Amazon SageMaker Realtime/Serverless Endpoint for relevance scoring and ranking
    signals.
- **Canonical Request & Response Contracts**:
  - Input payload MUST accept `userId` and `context` (`sessionData`, `userSignals`,
    `requestMetadata`).
  - Output payload MUST return `recommendations` ordered by `rank`, containing `itemId`, `rank`,
    `score`, and `source` (`batch|realtime|hybrid`).
- **Infrastructure & CI/CD**: Terraform (`>= 1.5`) for all AWS resources; GitHub Actions for CI
  testing, Terraform plan/apply (create), and Terraform destroy workflows.

## Development Workflow, Quality Gates & Ephemeral Lifecycle

1. **Specification & Contract First**: Every feature or component starts with clear input/output
   contracts and acceptance scenarios defined via Spec Kit artifacts (`spec.md`, `plan.md`,
   `tasks.md`).
2. **TDD & Edge-Case Gate**: Unit and integration tests (including fallback and business-filter
   edge cases) MUST be written and validated in CI before infrastructure deployment.
3. **Terraform Validation Gate**: All infrastructure changes MUST pass `terraform fmt -check`,
   `terraform validate`, and cost-minimizing SKU review before execution.
4. **Ephemeral PoC Lifecycle**: Cloud resources SHOULD be provisioned via the GitHub Actions
    creation workflow only for active integration testing or demonstration and destroyed immediately
   afterward via the GitHub Actions destroy workflow.

## Governance

- **Authority**: This Constitution supersedes ad-hoc implementation choices across all specs,
  implementation plans, task breakdowns, and code reviews in this repository.
- **Amendment Procedure**: Any modification to core principles, architectural layers, or stack
  constraints MUST be documented via `/speckit.constitution`, accompanied by a Sync Impact Report
  and rationale.
- **Versioning Policy**: Semantic Versioning (`MAJOR.MINOR.PATCH`) applies to this document:
  - `MAJOR`: Removal or backward-incompatible redefinition of a core principle or architectural
    constraint.
  - `MINOR`: Addition of a new principle, architectural layer, or material expansion of governance.
  - `PATCH`: Wording clarifications, formatting refinements, or non-semantic fixes.
- **Compliance Review**: Every `/speckit.plan`, `/speckit.tasks`, and `/speckit.analyze` execution
  MUST verify alignment with the 6 Core Principles—specifically checking minimum-cost AWS PoC sizing,
  Terraform create/destroy automation, and explicit test coverage of all hybrid fallback edge cases.

**Version**: 1.0.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-04
