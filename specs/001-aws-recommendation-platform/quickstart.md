# Quickstart Validation Guide: AWS Hybrid Recommendation Platform

**Feature**: AWS Hybrid Recommendation Platform  
**Branch**: `001-aws-recommendation-platform`  
**Status**: Ready for Validation  

---

## 1. Prerequisites

Before running the end-to-end validation scenarios, ensure the following tooling is installed locally:
- **Node.js**: v20.x LTS or higher
- **TypeScript**: v5.x
- **Python**: v3.10+ (for Glue/SageMaker mock scripts)
- **Terraform**: >= 1.5.0
- **Docker**: For running local DynamoDB and Redis/MemoryDB emulation containers
- **AWS CLI**: v2.x configured with credentials or mock profile

---

## 2. Local Environment Setup & Mock Verification

The platform codebase is structured to allow 100% of the hybrid recommendation orchestration logic, candidate merging, business-rule filtering, and fallback state transitions to run locally using lightweight in-memory and containerized mock adapters.

### Step 1: Install Dependencies
```bash
# In repository root
npm install
```

### Step 2: Start Local Mock Infrastructure (Docker)
```bash
# Spin up local DynamoDB Local and Redis/RediSearch for testing
docker run -d -p 8000:8000 --name ddb-local amazon/dynamodb-local
docker run -d -p 6379:6379 --name redis-search redis/redis-stack-server:latest
```

### Step 3: Seed Mock Datasets
```bash
# Execute local seeding script to populate DynamoDB table & Redis vector index
npm run seed:local
```

### Step 4: Run the Complete Test Suite
```bash
# Runs Unit, Contract, and Integration Edge-Case Test Suites
npm test
```

Expected output:
- **Happy Path Hybrid**: Batch (DynamoDB) + Semantic (MemoryDB) + Scoring (Mock SageMaker) merged into ranked response.
- **SageMaker Degradation Fallback**: Simulated SageMaker timeout (>35ms) triggers heuristic ranking; 200 OK returned.
- **MemoryDB Degradation Fallback**: Simulated Redis disconnect returns pure batch candidates tagged `batch`.
- **DynamoDB Degradation Fallback**: Simulated empty table returns pure real-time candidates tagged `realtime`.
- **Strict Business Filtering**: Proves that out-of-stock items and recently purchased products are 100% stripped from output.

---

## 3. Ephemeral Cloud Deployment (Terraform)

To validate the architecture on live AWS infrastructure within the **Minimum-Cost PoC Posture**, deploy via Terraform:

```bash
cd infra/terraform

# 1. Initialize Terraform
terraform init

# 2. Plan deployment with PoC cost parameters
terraform plan -var="environment=poc" -var="enable_serverless_inference=true"

# 3. Apply infrastructure
terraform apply -auto-approve -var="environment=poc" -var="enable_serverless_inference=true"
```

*Note: Infrastructure is parameterized with `force_destroy = true` on S3 buckets and minimal instance SKUs (`db.t4g.small`, Serverless Inference, Fargate Spot) to guarantee zero orphaned resources.*

---

## 4. End-to-End Live Validation Scenarios

### Scenario A: Hybrid Recommendation Request (Happy Path)
Query the ECS Application Load Balancer endpoint for an active user:

```bash
curl -i "http://<ALB-DNS-NAME>/v1/recommendations?userId=u-12345&limit=10"
```

**Expected Result**:
- HTTP Status `200 OK`
- Header: `content-type: application/json`
- Body conforms to [`recommendations-api.yaml`](./contracts/recommendations-api.yaml):
  - `degradedMode: false`
  - 10 items returned with `score`, `rank`, and `provenance` (`batch`, `realtime`, or `hybrid`)
  - `executionDurationMs < 60`

---

### Scenario B: Simulated Real-Time Degradation (Resilience Gate)
Simulate SageMaker Serverless Inference endpoint saturation or temporary outage:

```bash
# Invoke endpoint with test header triggering forced SageMaker timeout
curl -i -H "x-mock-sagemaker-fault: timeout" "http://<ALB-DNS-NAME>/v1/recommendations?userId=u-12345"
```

**Expected Result**:
- HTTP Status `200 OK` (Zero 500 server errors)
- Body contains:
  - `degradedMode: true`
  - Recommendations sorted by combined heuristic scores (`(0.6 * batch) + (0.4 * vector)`)
  - Response time < 50ms

---

### Scenario C: Strict Inventory & Suppression Enforcement
Request recommendations for a user whose top-scored batch items are out of stock or in recent order history:

```bash
curl -i "http://<ALB-DNS-NAME>/v1/recommendations?userId=u-out-of-stock-test"
```

**Expected Result**:
- HTTP Status `200 OK`
- Verification: Ineligible item IDs (`SKU-OUT-OF-STOCK`) NEVER appear in the `recommendations` list.

---

## 5. Ephemeral Infrastructure Teardown (MANDATORY)

To preserve the minimum-cost posture and eliminate idle cloud spend, tear down the AWS resources immediately after verification:

```bash
cd infra/terraform
terraform destroy -auto-approve -var="environment=poc"
```

**Teardown Verification**:
Verify zero remaining active instances via AWS CLI:
```bash
aws memorydb describe-clusters --query 'Clusters[*].ClusterName'
aws sagemaker list-endpoints --query 'Endpoints[*].EndpointName'
aws ecs list-tasks --cluster recommendations-poc-cluster
```
*(All commands should return empty arrays).*

---

## 6. GitHub Actions & AWS Repository Secrets Quick Reference

To execute the automated CI/CD and ephemeral Terraform workflows (`.github/workflows/ci.yml`, `terraform-create.yml`, and `terraform-destroy.yml`) directly from GitHub:

1. Configure the following **Repository Secrets** in GitHub (`Settings → Secrets and variables → Actions`):
   - `AWS_ROLE_ARN` *(Recommended OIDC)* or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (e.g., `us-east-1`)
   - `API_AUTH_TOKEN` (Optional API key for `/v1/recommendations` authentication)
   - `TF_STATE_BUCKET` / `TF_LOCK_TABLE` (Optional if using remote S3 backend)
2. Configure the following **Repository Variables** (or pass via `workflow_dispatch` inputs):
   - `PROJECT_NAME` (`ecommerce-recommendations`)
   - `ENVIRONMENT` (`poc`)
   - `ENABLE_SERVERLESS_INFERENCE` (`true`)
   - `ENABLE_MWAA` (`false` by default; `true` for full Airflow DAG runs)

See [`docs/GITHUB_AWS_SETUP.md`](../../docs/GITHUB_AWS_SETUP.md) for the complete step-by-step configuration guide.
