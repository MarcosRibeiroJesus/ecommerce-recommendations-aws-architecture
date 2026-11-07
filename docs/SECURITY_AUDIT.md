# Post-Implementation Security Audit Report (`T077`)

**Project**: AWS Hybrid Recommendation Platform (`001-aws-recommendation-platform`)  
**Audit Date**: 2026-11-07  
**Scope**: Infrastructure as Code (`infra/terraform/**`), Real-Time Serving Microservice (`src/serving/**`), Offline Batch Pipelines (`src/batch/**`), and CI/CD Workflows (`.github/workflows/**`).

---

## 1. Executive Summary

This post-implementation security audit evaluates all security controls across the 11 AWS services and CI/CD workflows following the Phase 9 remediation (`T068`–`T076`). All critical and high-severity security findings identified during the external PR #1 consistency review (`C1`, `C6`, `C7`) and the AWS Glue integration risk review have been remediated and verified via automated tests and `terraform validate`.

| Finding ID | Security Domain | Prior State (PR #1 Review) | Post-Remediation State (Phase 9) | Status |
| :--- | :--- | :--- | :--- | :---: |
| **SEC-01 (`C6`)** | IAM Least Privilege (ECS Task Role) | `Resource = "*"` on `dynamodb:GetItem`, `dynamodb:BatchGetItem`, and `sagemaker:InvokeEndpoint`. | Explicitly scoped to `var.dynamodb_table_arn` and `var.sagemaker_endpoint_arn` in `infra/terraform/modules/ecs_service/main.tf`. | **RESOLVED** |
| **SEC-02 (`C6`)** | IAM Least Privilege (Glue Execution Role) | Only AWS managed `AWSGlueServiceRole` attached; un-scoped data access. | Added explicit `aws_iam_role_policy.glue_data_access` scoped strictly to `var.golden_bucket_arn`, `var.golden_bucket_arn/*`, and `var.dynamodb_table_arn` in `infra/terraform/modules/glue_pipeline/main.tf`. | **RESOLVED** |
| **SEC-03 (`C6`)** | MemoryDB Encryption in Transit & Access Control | `tls_enabled = false` and `acl_name = "open-access"`. | Enabled `tls_enabled = true` and provisioned dedicated `aws_memorydb_acl.cluster_acl` in `infra/terraform/modules/memorydb_cluster/main.tf`. Python publisher `publish_memorydb_vectors.py` connects with `ssl=True`. | **RESOLVED** |
| **SEC-04 (`C6`)** | API Ingress Authentication | Unauthenticated `GET /v1/recommendations?userId=...` allowing arbitrary enumeration of user IDs. | Added configurable `x-api-key` authentication hook (`API_AUTH_TOKEN`) on `/v1/*` routes in `src/serving/src/presentation/server.ts` while keeping `/health` open for ALB target group health checks. | **RESOLVED** |
| **SEC-05 (`C7`)** | Business Governance Bypass on Degraded Fallback | `CuratedFallbackProvider` bypassed `BusinessFilterEngine` when primary candidates were empty. | `GetRecommendationsUseCase` now enforces all 4 rules (`OutOfStockFilterRule`, `RecentPurchaseSuppressionRule`, `CategorySuppressionRule`, `GeoRestrictionRule`) across both primary and curated fallback paths. | **RESOLVED** |
| **SEC-06 (`C1`)** | Container Supply Chain & Runtime Integrity | ECS Task Definition defaulted to placeholder `amazonlinux:latest`. | Provisioned `aws_ecr_repository.app` with `scan_on_push = true` and `AES256` encryption; `terraform-create.yml` builds and pushes `src/serving/Dockerfile` (non-root `USER node` Alpine image) to ECR. | **RESOLVED** |
| **SEC-07** | Glue ETL Resource Exhaustion & Throttling | Unbounded catalog joins on 2-DPU `G.1X` workers and unthrottled DynamoDB/MemoryDB writes. | Enforced `create_dynamic_frame.from_catalog(..., transformation_ctx=...)`, `F.broadcast(catalog_df)`, and rate-limited batch chunks (`batch_pause_seconds`, `chunk_pause_seconds`). | **RESOLVED** |

---

## 2. Detailed Control Verification by Layer

### 2.1 Identity & Access Management (IAM)
- **ECS Task Execution Role (`ecs-exec-role`)**: Restricted to `AmazonECSTaskExecutionRolePolicy` for pulling images from Amazon ECR and shipping logs to CloudWatch Logs.
- **ECS Task Role (`ecs-task-role`)**:
  - `dynamodb:GetItem` and `dynamodb:BatchGetItem` restricted exclusively to `module.dynamodb_recommendations.table_arn`.
  - `sagemaker:InvokeEndpoint` restricted exclusively to `module.sagemaker_ranking.endpoint_arn`.
  - `cloudwatch:PutMetricData` scoped to namespace emission.
- **Glue Service Role (`glue-role`)**:
  - Attached `AWSGlueServiceRole` for Glue catalog metadata and CloudWatch logs.
  - Inline policy `glue_data_access` restricts `s3:GetObject`, `s3:PutObject`, and `s3:ListBucket` strictly to the S3 Golden Dataset bucket ARN (`module.s3_golden_dataset.bucket_arn`) and `dynamodb:BatchWriteItem` / `dynamodb:PutItem` strictly to `module.dynamodb_recommendations.table_arn`.
- **SageMaker Execution Role (`sm-role`)**:
  - S3 read/write permissions restricted strictly to `${var.golden_bucket_arn}/*`.

### 2.2 Data Protection (Encryption at Rest & In Transit)
- **Amazon S3 (`infra/terraform/modules/s3_golden_dataset/main.tf`)**:
  - Customer-Managed AWS KMS Key (`aws_kms_key.s3_kms`) with `enable_key_rotation = true` and 7-day deletion window.
  - Default Server-Side Encryption (`aws_s3_bucket_server_side_encryption_configuration`) using `aws:kms`.
  - Unconditional `aws_s3_bucket_public_access_block` (`block_public_acls = true`, `block_public_policy = true`, `ignore_public_acls = true`, `restrict_public_buckets = true`).
  - Bucket versioning enabled (`aws_s3_bucket_versioning`).
- **Amazon DynamoDB (`infra/terraform/modules/dynamodb_recommendations/main.tf`)**:
  - Server-side encryption enabled (`server_side_encryption { enabled = true }`).
  - Point-in-Time Recovery (`point_in_time_recovery { enabled = true }`).
  - Automatic 7-day data expiration via `ttl { attribute_name = "ttlTimestamp", enabled = true }`.
- **Amazon MemoryDB for Redis (`infra/terraform/modules/memorydb_cluster/main.tf`)**:
  - In-transit encryption enabled (`tls_enabled = true`).
  - Access Control List provisioned via `aws_memorydb_acl.cluster_acl`.

### 2.3 Data Lake Governance
- **AWS Lake Formation (`infra/terraform/modules/lake_formation/main.tf`)**:
  - S3 Golden Dataset registered as a managed Lake Formation resource (`aws_lakeformation_resource.golden_bucket`).
  - Glue Data Catalog database (`ecommerce_golden_db`) governed centrally to prevent unauthorized direct S3 access.

### 2.4 Network & Compute Isolation
- **VPC Topology (`infra/terraform/modules/networking/main.tf`)**:
  - Dedicated VPC (`10.0.0.0/16`) spanning 2 Availability Zones with segregated public (`10.0.1.0/24`, `10.0.2.0/24`) and private (`10.0.10.0/24`, `10.0.11.0/24`) subnets.
  - Private S3 Gateway VPC Endpoint (`aws_vpc_endpoint.s3_gateway`) routes S3 traffic over the AWS private backbone without traversing the public internet.
  - Security Group isolation (`ecs_sg` allows inbound `3000/tcp` only from within the VPC CIDR; `memorydb_sg` allows inbound `6379/tcp` only from within the VPC CIDR).
- **Container Hardening (`src/serving/Dockerfile`)**:
  - Multi-stage Alpine build (`node:20-alpine`) strips build tools and TypeScript sources from the runtime image.
  - Runs as unprivileged user (`USER node`).
  - ECR repository enforces automated vulnerability scanning on every push (`scan_on_push = true`).

### 2.5 Application-Layer Security & Input Validation
- **API Authentication (`src/serving/src/presentation/server.ts`)**:
  - Enforces `x-api-key` validation against `API_AUTH_TOKEN` on all `/v1/*` endpoints when configured, returning `401 Unauthorized` on missing or mismatched tokens.
- **Input Sanitization (`src/serving/src/presentation/routes/recommendations.route.ts`)**:
  - Strict regex validation on `userId` (`^[a-zA-Z0-9_-]+$`, max length 64) prevents injection attacks into DynamoDB partition keys or Redis vector queries.
  - Bound checks on `limit` (`1..50`) prevent resource exhaustion attacks.

### 2.6 CI/CD & Secret Management
- **GitHub Actions (`.github/workflows/terraform-create.yml`, `.github/workflows/terraform-destroy.yml`)**:
  - Supports temporary, short-lived AWS credentials via **AWS IAM OIDC Identity Provider** (`role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`) with fallback to IAM Access Keys.
  - Zero credentials or tokens are hardcoded in the repository.

---

## 3. Production Hardening Roadmap (Beyond PoC/MVP)

When transitioning from the PoC/Ephemeral posture (`environment = "poc"`) to an enterprise Production environment (`environment = "prod"`), apply the following additional controls:

1. **HTTPS / TLS Termination on ALB with AWS ACM**:
   - Replace the port `80` HTTP listener on `aws_lb_listener.http` with an HTTPS (`443`) listener backed by an AWS Certificate Manager (ACM) TLS 1.3 certificate (`ELBSecurityPolicy-TLS13-1-2-2021-06`) and configure HTTP-to-HTTPS redirect.
2. **End-User Identity Binding (JWT / Amazon Cognito / API Gateway)**:
   - Replace the shared `x-api-key` service token with an OIDC/JWT authorizer (Amazon Cognito or API Gateway JWT Authorizer) that binds the authenticated subject (`sub` claim) directly to `userId`, eliminating IDOR (Insecure Direct Object Reference) risks if the API is exposed directly to browser clients rather than an internal BFF (Backend-for-Frontend).
3. **AWS WAFv2 on Application Load Balancer**:
   - Attach an AWS WAFv2 WebACL with AWS Managed Rules (`AWSManagedRulesCommonRuleSet`, `AWSManagedRulesKnownBadInputsRuleSet`) and IP-based rate-limiting rules (e.g., max 1,000 requests per 5 minutes per IP).
4. **MemoryDB SCRAM-SHA-256 User Passwords in AWS Secrets Manager**:
   - Provision an `aws_memorydb_user` backed by a password stored and automatically rotated in AWS Secrets Manager, and inject the secret ARN into the ECS Task Definition (`secrets` block) and Glue Job arguments.
