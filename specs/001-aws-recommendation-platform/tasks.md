# Tasks: AWS Hybrid Recommendation Platform

**Input**: Design documents from `/specs/001-aws-recommendation-platform/` (`spec.md`, `plan.md`, `data-model.md`, `contracts/`, `research.md`, `quickstart.md`, `.specify/memory/constitution.md`)

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are MANDATORY per Constitution Principle III (Test-First & Exhaustive Edge-Case Proof) and are integrated directly into each user story phase before implementation tasks.

**Organization**: Tasks are grouped strictly by user story to enable independent implementation and testing of each story in priority order (P1 → P2 → P3 → P4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on uncompleted tasks)
- **[Story]**: User story identifier ([US1], [US2], [US3], [US4]) for user story phases; omitted for Setup, Foundational, and Polish phases
- Every task includes the exact file path and quotes all schema and validation constraints verbatim

---

## Phase 1: Setup (Shared Infrastructure & Monorepo Initialization)

**Purpose**: Project initialization, monorepo structure, tooling, and baseline Terraform definition

- [X] T001 Initialize monorepo root package.json with workspace definition for `src/serving`, test scripts, and build scripts in `package.json`
- [X] T002 [P] Configure TypeScript project references and compiler options (Node20, ES2022, strict mode) in `tsconfig.json` and `src/serving/tsconfig.json`
- [X] T003 [P] Configure ESLint, Prettier, and Vitest test runner configuration in `.eslintrc.json`, `.prettierrc`, and `vitest.config.ts`
- [X] T004 [P] Implement environment variable parsing and schema validation using Zod/Fastify-env (`PORT`, `AWS_REGION`, `DYNAMODB_TABLE_NAME`, `MEMORYDB_CLUSTER_ENDPOINT`, `SAGEMAKER_ENDPOINT_NAME`, `LOG_LEVEL`) in `src/serving/src/config/env.ts`
- [X] T005 [P] Initialize Terraform root structure and AWS provider (`>= 5.0`) configuration in `infra/terraform/main.tf`, `infra/terraform/variables.tf`, and `infra/terraform/outputs.tf`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core domain models, cross-cutting logging, resilience utilities, HTTP foundation, and baseline cloud networking that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Define core domain types (`MergedCandidate`, `CandidateProvenance` enum `['batch', 'realtime', 'hybrid', 'fallback']`, `RecommendedItem`) with strict validation rules in `src/serving/src/domain/candidate.ts`
- [X] T007 [P] Implement structured JSON logger with correlation/request ID propagation, stage duration metrics, and Pino serializer in `src/serving/src/infrastructure/logging/logger.ts`
- [X] T008 [P] Implement circuit breaker and retry utility using `opossum` for downstream AWS client calls with configurable failure thresholds in `src/serving/src/infrastructure/resilience/circuit-breaker.ts`
- [X] T009 [P] Create in-memory LRU cache provider for catalog metadata and fallback items in `src/serving/src/infrastructure/cache/lru-cache.provider.ts`
- [X] T010 Implement Fastify HTTP server shell with error handling, request ID middleware, and schema validation plugins in `src/serving/src/presentation/server.ts`
- [X] T011 [P] Implement service health controller and route returning `status` enum `['UP', 'DEGRADED', 'DOWN']` per OpenAPI contract in `src/serving/src/presentation/controllers/health.controller.ts`
- [X] T012 [P] Create Terraform networking module provisioning VPC, private subnets across 3 AZs, and S3 Gateway VPC Endpoint in `infra/terraform/modules/networking/main.tf`
- [X] T013 [P] Create Terraform S3 Golden Dataset module with KMS encryption, Parquet prefixes (`catalog/`, `interactions/`, `user_features/`), and `force_destroy = true` in `infra/terraform/modules/s3_golden_dataset/main.tf`
- [X] T014 [P] Create Terraform Lake Formation and Glue Data Catalog database module (`ecommerce_golden_db`) in `infra/terraform/modules/lake_formation/main.tf`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel or sequentially.

---

## Phase 3: User Story 1 - Personalized Hybrid E-Commerce Recommendations (Priority: P1) 🎯 MVP

**Goal**: Deliver end-to-end hybrid recommendations for active shoppers by concurrently fetching batch candidates from DynamoDB and vector candidates from MemoryDB, merging them with provenance tagging, scoring via SageMaker Serverless Inference, and serving Top-N items via Fastify API within 60ms P95.

**Independent Test**: Seed DynamoDB with user batch profile and MemoryDB with product vectors. Query `GET /v1/recommendations?userId=u-12345&limit=10`. Verify HTTP 200 OK with 10 ranked products containing `batch`, `realtime`, and `hybrid` provenance tags within 60ms P95.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T015 [P] [US1] Unit test candidate merging, deduplication, and provenance tagging (`batch`, `realtime`, `hybrid`) in `tests/unit/candidate-merger.test.ts`
- [X] T016 [P] [US1] Contract test for `GET /v1/recommendations` validating query parameters (`userId` matching pattern `^[a-zA-Z0-9_\-]+$`, `limit` integer 1-50, `category`, `sessionItemIds`) and response payload against `recommendations-api.yaml` in `tests/contract/recommendations-api.contract.test.ts`
- [X] T017 [P] [US1] Integration test for complete happy-path hybrid recommendation flow with mocked AWS SDK clients in `tests/integration/hybrid-recommendation.test.ts`

### Implementation for User Story 1

- [X] T018 [P] [US1] Implement DynamoDB Batch Candidate Repository using `@aws-sdk/lib-dynamodb` querying `user_recommendations` table by partition key `userId`, validating `userId` pattern `^[a-zA-Z0-9_\-]+$` and `recommendations` array length between 1 and 50 in `src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository.ts`
- [X] T019 [P] [US1] Implement MemoryDB Vector Candidate Repository using `ioredis` executing `FT.SEARCH item_idx "*=>[KNN 50 @v $vec AS vector_score]"` with 128-dim Float32 vector buffer (512 bytes) and mapping `vectorScore = 1.0 - parseFloat(vector_score)` in `src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository.ts`
- [X] T020 [P] [US1] Implement SageMaker Scoring Client invoking Serverless Inference endpoint via `@aws-sdk/client-sagemaker-runtime` adhering to `sagemaker-inference-contract.json` with input candidates array length 1 to 100 in `src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client.ts`
- [X] T021 [US1] Implement Candidate Merger use case to combine DynamoDB and MemoryDB candidates, deduplicate by `itemId`, calculate `initialCombinedScore`, and assign provenance (`batch`, `realtime`, `hybrid`) in `src/serving/src/application/candidate-merger.ts`
- [X] T022 [US1] Implement SageMaker Reranker use case to format scoring inputs, invoke SageMaker client, sort candidates by descending model score, and build final `RecommendedItem` array with rank positions in `src/serving/src/application/reranker.ts`
- [X] T023 [US1] Implement GetRecommendationsUseCase orchestrating parallel retrieval from DynamoDB and MemoryDB, candidate merging, and SageMaker reranking in `src/serving/src/application/get-recommendations.use-case.ts`
- [X] T024 [US1] Implement RecommendationController handling `GET /v1/recommendations`, parsing query parameters (`userId`, `limit`, `category`, `sessionItemIds`), and returning `RecommendationResponse` in `src/serving/src/presentation/controllers/recommendation.controller.ts`
- [X] T025 [P] [US1] Create Terraform DynamoDB table module for `user_recommendations` with `billing_mode = "PAY_PER_REQUEST"`, partition key `userId` (`STRING`), and TTL attribute `ttlTimestamp` in `infra/terraform/modules/dynamodb_table/main.tf`
- [X] T026 [P] [US1] Create Terraform MemoryDB single-shard cluster module (`db.t4g.small`, 0 replicas) with vector search index configuration in `infra/terraform/modules/memorydb_cluster/main.tf`
- [X] T027 [P] [US1] Create Terraform SageMaker Serverless Inference endpoint module (2048 MB memory, MaxConcurrency 5) in `infra/terraform/modules/sagemaker_endpoint/main.tf`
- [X] T028 [P] [US1] Create Terraform ECS Fargate Spot task definition (0.5 vCPU, 1 GB RAM) and service module behind ALB in `infra/terraform/modules/ecs_service/main.tf`
- [X] T029 [US1] Create Dockerfile for Recommendation Service container image build in `src/serving/Dockerfile`

**Checkpoint**: At this point, User Story 1 is fully functional and delivers the complete hybrid MVP recommendation increment!

---

## Phase 4: User Story 2 - Resilient Real-Time Degradation & Fallback (Priority: P2)

**Goal**: Guarantee zero customer-facing 500 errors and sub-25ms response by gracefully degrading when SageMaker times out (>35ms), MemoryDB is unreachable, or DynamoDB is unavailable.

**Independent Test**: Simulate 100% error rate or timeout on SageMaker Endpoint and MemoryDB; verify response falls back with HTTP 200 OK, `degradedMode: true`, heuristic reranking or batch-only candidates, and CloudWatch degradation metric emitted.

### Tests for User Story 2 ⚠️

- [X] T030 [P] [US2] Integration test for SageMaker timeout (>35ms) fallback to heuristic reranker (`(0.6 * batchScore) + (0.4 * vectorScore)`) with `degradedMode: true` in `tests/integration/fallback-sagemaker-degradation.test.ts`
- [X] T031 [P] [US2] Integration test for MemoryDB unreachable fallback returning pure DynamoDB batch candidates with `provenance: 'batch'` in `tests/integration/fallback-memorydb-outage.test.ts`
- [X] T032 [P] [US2] Integration test for DynamoDB unavailable/empty fallback returning pure MemoryDB vector candidates with `provenance: 'realtime'` in `tests/integration/fallback-dynamodb-outage.test.ts`
- [X] T033 [P] [US2] Integration test for complete downstream outage falling back to curated popular items with `provenance: 'fallback'` in `tests/integration/fallback-complete-outage.test.ts`

### Implementation for User Story 2

- [X] T034 [US2] Implement heuristic fallback reranker calculating weighted score `(0.6 * batchScore) + (0.4 * vectorScore)` when SageMaker is timed out or unavailable in `src/serving/src/application/heuristic-reranker.ts`
- [X] T035 [US2] Implement curated fallback provider loading static high-seller recommendations when all candidate sources fail in `src/serving/src/infrastructure/fallback/curated-fallback.provider.ts`
- [X] T036 [US2] Integrate circuit breaker failure handlers into `GetRecommendationsUseCase` setting `degradedMode: true` on fallback in `src/serving/src/application/get-recommendations.use-case.ts`
- [X] T037 [US2] Implement CloudWatch degradation metric publishing (`DegradedModeCount`, `SageMakerFallbackCount`, `MemoryDbFallbackCount`) in `src/serving/src/infrastructure/monitoring/cloudwatch-metrics.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 are complete, providing both hybrid personalization and resilient fallback.

---

## Phase 5: User Story 3 - Strict Business Rule & Eligibility Filtering (Priority: P3)

**Goal**: Guarantee 100% compliance by unconditionally filtering out out-of-stock items (`in_stock: false`), restricted categories, and products purchased by the user in the past 30 days prior to scoring.

**Independent Test**: Inject high-scoring candidate items flagged as out-of-stock or in the user's recent order history; verify 0 ineligible items appear in the response payload.

### Tests for User Story 3 ⚠️

- [X] T038 [P] [US3] Unit test for business rule filtering validating out-of-stock exclusion, recent purchase suppression (30 days), and geo restrictions in `tests/unit/business-filter-engine.test.ts`
- [X] T039 [P] [US3] Integration test ensuring high-scoring out-of-stock candidates are completely omitted from API response in `tests/integration/business-filter-enforcement.test.ts`

### Implementation for User Story 3

- [X] T040 [P] [US3] Implement business filter rules (`OutOfStockFilterRule`, `RecentPurchaseSuppressionRule`, `CategorySuppressionRule`, `GeoRestrictionRule`) in `src/serving/src/domain/filter-rule.ts`
- [X] T041 [US3] Implement BusinessFilterEngine executing all filter rules against candidate pool, emitting candidate counts before/after filtering in `src/serving/src/application/business-filter-engine.ts`
- [X] T042 [US3] Integrate BusinessFilterEngine into `GetRecommendationsUseCase` between CandidateMerger and SageMaker reranking in `src/serving/src/application/get-recommendations.use-case.ts`
- [X] T043 [P] [US3] Implement user recent order history and item stock cache adapter in `src/serving/src/infrastructure/cache/inventory-eligibility.repository.ts`

**Checkpoint**: At this point, User Stories 1, 2, and 3 are complete, ensuring personalized, resilient, and business-compliant serving!

---

## Phase 6: User Story 4 - Automated Batch Retraining & Publishing Workflow (Priority: P4)

**Goal**: Autonomously coordinate daily data extraction from S3 via Athena, feature engineering via AWS Glue, Spot training in SageMaker, and artifact publishing to DynamoDB and MemoryDB via Amazon MWAA Airflow DAG.

**Independent Test**: Trigger MWAA Airflow DAG ad-hoc or via test runner; verify DAG runs end-to-end, writes updated partition keys to DynamoDB table with TTL (`generatedAt + 604800`), and populates vector index `item_idx` in MemoryDB.

### Tests for User Story 4 ⚠️

- [X] T044 [P] [US4] Unit test for Airflow DAG structure, task dependencies, and parameter validations in `tests/unit/airflow-dag-validation.test.py`
- [X] T045 [P] [US4] Integration test validating Glue PySpark transformation schema and Snappy Parquet partition outputs in `tests/integration/test_glue_transformations.py`
- [X] T046 [P] [US4] Contract test for DynamoDB item publishing matching `dynamodb-batch-recs-contract.json` in `tests/contract/test_dynamodb_publish_contract.py`
- [X] T047 [P] [US4] Contract test for MemoryDB vector upsert matching `memorydb-vector-contract.md` in `tests/contract/test_memorydb_vector_contract.py`

### Implementation for User Story 4

- [X] T048 [P] [US4] Implement Athena extraction and data validation SQL scripts with partition pruning in `src/batch/athena/extract_curated_features.sql`
- [X] T049 [P] [US4] Implement AWS Glue PySpark feature engineering script with Job Bookmarks enabled in `src/batch/glue/feature_engineering.py`
- [X] T050 [P] [US4] Implement SageMaker collaborative filtering model training and embedding generation script with Managed Spot Instances in `src/batch/sagemaker/train_model.py`
- [X] T051 [P] [US4] Implement AWS Glue DynamoDB publisher script generating batch profiles with 7-day TTL (`ttlTimestamp = generatedAt + 604800`) in `src/batch/glue/publish_dynamodb.py`
- [X] T052 [P] [US4] Implement AWS Glue / Python MemoryDB vector publishing script indexing 128-dim Float32 vectors to `item_idx` in `src/batch/glue/publish_memorydb_vectors.py`
- [X] T053 [US4] Implement MWAA Apache Airflow DAG `daily_hybrid_recommendation_pipeline` coordinating sensor, Athena, Glue, SageMaker, and publishing tasks in `src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py`
- [X] T054 [P] [US4] Create Terraform Athena workgroup and named queries module with 10 GB scan limit in `infra/terraform/modules/athena_queries/main.tf`
- [X] T055 [P] [US4] Create Terraform AWS Glue jobs module with `worker_type = "G.1X"` and `number_of_workers = 2` in `infra/terraform/modules/glue_pipeline/main.tf`
- [X] T056 [P] [US4] Create Terraform SageMaker Spot training job configuration module in `infra/terraform/modules/sagemaker_training/main.tf`
- [X] T057 [P] [US4] Create Terraform MWAA environment module (`mw1.small`, ephemeral parameterization) in `infra/terraform/modules/mwaa_orchestration/main.tf`

**Checkpoint**: All user stories (US1 through US4) are fully functional across both batch and real-time serving!

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Observability dashboards, CI/CD automated provisioning/teardown pipelines, local developer verification scripts, and documentation.

- [X] T058 [P] Create CloudWatch dashboard and alarm Terraform module in `infra/terraform/modules/cloudwatch_monitoring/main.tf`
- [X] T059 [P] Implement GitHub Actions CI workflow for linting, typechecking, and automated test execution in `.github/workflows/ci.yml`
- [X] T060 [P] Implement GitHub Actions on-demand Terraform creation workflow with PoC parameters in `.github/workflows/terraform-create.yml`
- [X] T061 [P] Implement GitHub Actions on-demand Terraform destroy workflow enforcing complete teardown in `.github/workflows/terraform-destroy.yml`
- [X] T062 [P] Implement local mock data seeder script populating local DynamoDB and Redis in `scripts/seed-local.ts`
- [X] T063 Validate end-to-end execution flow following `quickstart.md` and update documentation in `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**.
- **User Story 1 (Phase 3 - P1 🎯 MVP)**: Depends on Foundational phase completion.
- **User Story 2 (Phase 4 - P2)**: Depends on Foundational phase completion and extends US1 orchestration.
- **User Story 3 (Phase 5 - P3)**: Depends on Foundational phase completion and integrates into US1 pipeline.
- **User Story 4 (Phase 6 - P4)**: Depends on Foundational phase completion (S3, Lake Formation) and feeds US1 stores (DynamoDB, MemoryDB).
- **Polish (Phase 7)**: Depends on all desired user stories being completed.

### User Story Dependencies

- **User Story 1 (P1 🎯 MVP)**: Can start after Foundational (Phase 2) - No dependencies on other stories.
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Integrates into US1 use cases but is independently testable via simulated faults.
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Integrates into US1 candidate flow but is independently testable with mock item catalogs.
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Batch pipelines output to DynamoDB and MemoryDB schemas defined in contracts.

### Within Each User Story

1. Tests MUST be written and fail before implementation.
2. Domain models and repository interfaces before services.
3. Repositories and infrastructure adapters before orchestration use cases.
4. Use cases before controllers and API routes.
5. Story verified independently before moving to next priority.

### Parallel Opportunities

- **Phase 1 (Setup)**: T002, T003, T004, T005 can all run in parallel after T001.
- **Phase 2 (Foundational)**: T007, T008, T009, T011, T012, T013, T014 can all run in parallel after T006.
- **Phase 3 (US1)**: 
  - Tests: T015, T016, T017 can be written in parallel.
  - Infrastructure: T018, T019, T020 can be implemented in parallel.
  - Terraform: T025, T026, T027, T028 can be implemented in parallel.
- **Phase 4 (US2)**: Tests T030, T031, T032, T033 can run in parallel.
- **Phase 5 (US3)**: Tests T038, T039 and implementation T040, T043 can run in parallel.
- **Phase 6 (US4)**: Tests T044, T045, T046, T047 can run in parallel; scripts T048, T049, T050, T051, T052 can be authored in parallel; Terraform modules T054, T055, T056, T057 can run in parallel.
- **Phase 7 (Polish)**: T058, T059, T060, T061, T062 can all run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch all test tasks for User Story 1 together:
Task: "Unit test candidate merging, deduplication, and provenance tagging in tests/unit/candidate-merger.test.ts"
Task: "Contract test for GET /v1/recommendations in tests/contract/recommendations-api.contract.test.ts"
Task: "Integration test for complete happy-path hybrid flow in tests/integration/hybrid-recommendation.test.ts"

# Launch all infrastructure adapters for User Story 1 together:
Task: "Implement DynamoDB Batch Candidate Repository in src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository.ts"
Task: "Implement MemoryDB Vector Candidate Repository in src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository.ts"
Task: "Implement SageMaker Scoring Client in src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T014) — **CRITICAL**: Blocks all user stories
3. Complete Phase 3: User Story 1 (T015–T029)
4. **STOP and VALIDATE**: Test User Story 1 independently with mock adapters and `GET /v1/recommendations`
5. Deploy/demo the working MVP hybrid recommendation API!

### Incremental Delivery

1. Setup + Foundational → Foundation verified
2. Add User Story 1 → Validate hybrid personalization (MVP!)
3. Add User Story 2 → Validate fallback and degradation resilience (Zero 500s)
4. Add User Story 3 → Validate strict inventory suppression (Compliance guarantee)
5. Add User Story 4 → Validate automated batch retraining via Airflow (Autonomous refresh)
6. Add Polish → Validate CI/CD, ephemeral Terraform create/destroy, and CloudWatch metrics

---

## Notes

- Every task strictly follows `- [ ] [TaskID] [P?] [Story?] Description with file path`
- `[P]` tasks operate on different files with no incomplete dependencies
- `[Story]` label maps directly to user stories ([US1], [US2], [US3], [US4]) for clear traceability
- All schema and validation constraints from `data-model.md` and `contracts/` are quoted verbatim
- Stop at each checkpoint to validate each story independently

---

## Phase 8: Convergence

**Purpose**: Remediate gaps between architecture specification, constitution quality gates, and code implementation discovered during convergence assessment.

- [X] T064 Fix ESLint syntax errors and unused imports in `src/serving/src/domain/candidate.ts`, `src/serving/src/presentation/controllers/recommendation.controller.ts`, `src/serving/src/infrastructure/resilience/circuit-breaker.ts`, `src/serving/src/application/get-recommendations.use-case.ts`, `src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client.ts`, and `tests/contract/recommendations-api.contract.test.ts` per Constitution III & V (contradicts)
- [X] T065 Wire up batch processing and monitoring modules (`athena_queries`, `glue_pipeline`, `sagemaker_training`, `mwaa_orchestration`, `cloudwatch_monitoring`) into `infra/terraform/main.tf` and declare `enable_mwaa` in `infra/terraform/variables.tf` per FR-003, FR-004, FR-005, FR-006, FR-018, FR-020 (partial)
- [X] T066 Format Terraform configurations with `terraform fmt -recursive` across `infra/terraform/` and update deprecated `data.aws_region.current.name` to `region` in `infra/terraform/modules/ecs_service/main.tf` per Constitution V (contradicts)
- [X] T067 Standardize Airflow DAG validation test naming by consolidating `tests/unit/airflow-dag-validation.test.py` and `tests/unit/test_airflow_dag_validation.py` per T044 and CI discovery configuration (unrequested)

---

## Phase 9: External Audit Remediation, Security Hardening, GitHub Actions AWS Setup & Reference Architecture

**Purpose**: Remediate all external PR #1 review findings (`C1`–`C9`) and AWS Glue integration risks across Serving (Point 1), Terraform & Security (Point 2), and Batch/Testing (Point 3), followed by a comprehensive Security Audit, GitHub Actions + AWS Secrets Setup Guide, and Reference Architecture Diagram (`T068`–`T079`).

### Point 1: Serving Layer Remediation — Deterministic Session Vectors & Complete Eligibility Filtering (`C3`, `C7`)

- [X] T068 [P] [US1] [US3] Write unit tests for deterministic 128-dim L2-normalized vector derivation from `sessionItemIds` (and `userId` fallback) in `tests/unit/session-embedding.test.ts` and update `tests/integration/fallback-complete-outage.test.ts` to assert that `CuratedFallbackProvider` items are filtered by `BusinessFilterEngine`
- [X] T069 [US1] Implement `deriveSessionQueryVector(sessionItemIds?: string[], userId?: string): Float32Array` using SHA-256 recency-weighted hashing and L2 normalization in `src/serving/src/application/session-embedding.ts` and wire into `GetRecommendationsUseCase.execute()` in `src/serving/src/application/get-recommendations.use-case.ts` (`C3`, `FR-009`, `FR-012`)
- [X] T070 [US2] [US3] Register all 4 filter rules (`OutOfStockFilterRule`, `RecentPurchaseSuppressionRule`, `CategorySuppressionRule`, `GeoRestrictionRule`) in `GetRecommendationsUseCase` default `BusinessFilterEngine`, enrich and filter `CuratedFallbackProvider` candidates through `BusinessFilterEngine.filter()` before returning degraded responses in `src/serving/src/application/get-recommendations.use-case.ts` and `src/serving/src/infrastructure/fallback/curated-fallback.provider.ts` (`C7`, `FR-014`, `FR-017`, `SC-006`)

### Point 2: Terraform Infrastructure, ECR Wiring & Security Hardening (`C1`, `C4`, `C6`, `C8`)

- [X] T071 [P] [US1] Provision `aws_ecr_repository` (`${var.project_name}-${var.environment}-serving`, `force_delete = true`, scan on push) in `infra/terraform/modules/ecs_service/main.tf`, update default `container_image` to ECR repository URL in `infra/terraform/modules/ecs_service/variables.tf`, expose `ecr_repository_url` in `infra/terraform/outputs.tf`, and add Docker build/push steps to `.github/workflows/terraform-create.yml` (`C1`, `FR-011`, `FR-020`)
- [X] T072 [P] [US4] Declare `aws_s3_object` and `aws_glue_job` resources for `publish_batch_dynamodb` (`src/batch/glue/publish_dynamodb.py`) and `publish_memorydb_vectors` (`src/batch/glue/publish_memorydb_vectors.py`) alongside `feature_engineering` in `infra/terraform/modules/glue_pipeline/main.tf` and `infra/terraform/modules/glue_pipeline/outputs.tf` (`C4`, `FR-005`, `FR-007`, `FR-008`)
- [X] T073 [P] Harden security across Terraform and Serving: replace wildcard `Resource = "*"` IAM policies with explicit resource ARNs (`dynamodb_table_arn`, `sagemaker_endpoint_arn`, `s3_bucket_arn`) in `infra/terraform/modules/ecs_service/main.tf`, `infra/terraform/modules/glue_pipeline/main.tf`, and `infra/terraform/main.tf`; enable `tls_enabled = true` and `aws_memorydb_acl` in `infra/terraform/modules/memorydb_cluster/main.tf`; and implement configurable `x-api-key` authentication middleware (`API_AUTH_TOKEN`) in `src/serving/src/config/env.ts` and `src/serving/src/presentation/server.ts` (`C6`, `FR-011`, `FR-020`)

### Point 3: End-to-End Batch Pipeline Handoff, Glue Risk Mitigation & Behavioral Tests (`C2`, `C4`, `C9`)

- [X] T074 [P] [US4] Refactor `src/batch/glue/feature_engineering.py` to read via `glue_context.create_dynamic_frame.from_catalog(..., transformation_ctx="datasource_interactions")` for Glue Job Bookmark state tracking, apply `F.broadcast(catalog_df)` before joining with `interactions_df` to prevent 2-DPU `G.1X` shuffle OOM, and parameterize S3 bucket/database names via CLI/environment variables (`C2`, `C4`, `FR-005`)
- [X] T075 [US4] Connect end-to-end batch artifact flow across `src/batch/sagemaker/train_model.py`, `src/batch/glue/publish_dynamodb.py`, `src/batch/glue/publish_memorydb_vectors.py`, and `src/batch/airflow/dags/daily_hybrid_recommendation_pipeline.py` so `train_model.py` consumes engineered features and writes `item_embeddings_128dim.json` + `user_recommendations.json` consumed by the publishers with rate-limited batching, parameterized resource names, and Redis TLS support (`C2`, `C4`, `FR-006`, `FR-007`, `FR-008`)
- [X] T076 [US4] Replace static string-matching assertions with behavioral execution and contract tests in `tests/integration/test_glue_transformations.py`, `tests/contract/test_dynamodb_publish_contract.py`, and `tests/contract/test_memorydb_vector_contract.py` verifying real function execution, artifact handoff, Job Bookmark `transformation_ctx`, and schema compliance (`C9`, Constitution Principle III)

### Point 4: Post-Remediation Security Audit, GitHub Actions AWS Setup Guide & Reference Architecture Diagram

- [X] T077 Analyze and verify all security controls after implementing `T068`–`T076` (IAM least privilege, VPC isolation, MemoryDB TLS/ACL, S3 KMS encryption, API key auth, and CI/CD secret boundaries) and document the audit matrix in `docs/SECURITY_AUDIT.md` (`C6`)
- [X] T078 [P] Create comprehensive step-by-step GitHub + AWS connection and CI/CD configuration guide in `docs/GITHUB_AWS_SETUP.md` (covering IAM OIDC provider setup, IAM Role trust policy, Access Key alternative, and complete table of all required GitHub Repository Secrets and Variables) and link from `README.md` (`FR-020`)
- [X] T079 [P] Create faithful AWS Reference Architecture Diagram and component data-flow documentation in `docs/ARCHITECTURE_DIAGRAM.md` (and update `README.md` / `specs/001-aws-recommendation-platform/spec.md`) modeled on the AWS Big Data Blog reference (*"Building a scalable, personalized recommendation system on AWS: From batch to real-time"*)


