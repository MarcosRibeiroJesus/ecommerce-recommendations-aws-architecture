# GitHub + AWS CI/CD Setup Guide (`T078`)

This guide explains step by step how anyone can fork or clone this repository and configure **GitHub Actions** to automatically test, build, deploy (`terraform-create.yml`), and tear down (`terraform-destroy.yml`) the **AWS Hybrid Recommendation Platform** on their own AWS account using GitHub Repository Secrets and Variables.

---

## 1. Architecture of the GitHub Actions Workflows

The repository includes three automated workflows in [`.github/workflows/`](file:///C:/Users/mrj84/Documents/Learning/exemplo-01-ecommerce-recomendations-aws-architecture/.github/workflows):

| Workflow File | Trigger | Purpose |
| :--- | :--- | :--- |
| **`ci.yml`** | Every `push` and `pull_request` to `main` or `001-aws-recommendation-platform` | Runs TypeScript build, ESLint, Vitest unit/contract/integration suites, Python batch/contract tests, and `terraform fmt -check` + `terraform validate`. Requires **no AWS credentials**. |
| **`terraform-create.yml`** | Manual (`workflow_dispatch`) | Authenticates to AWS, runs `terraform apply`, builds & pushes the Fastify Docker image (`src/serving/Dockerfile`) to the newly provisioned Amazon ECR repository, forces an ECS Fargate rollout, and runs live HTTP smoke tests against `/health` and `/v1/recommendations`. |
| **`terraform-destroy.yml`** | Manual (`workflow_dispatch`) | Authenticates to AWS and executes `terraform destroy -auto-approve` with `force_destroy=true` so that S3 buckets and ECR repositories are cleanly emptied and removed, guaranteeing **$0.00 idle cloud charges**. |

---

## 2. Step-by-Step AWS Authentication Setup

The workflows support **two authentication methods** automatically:
- **Option A (Recommended — Best Practice)**: **AWS IAM OpenID Connect (OIDC)** with short-lived credentials and zero long-lived access keys stored in GitHub.
- **Option B (Alternative — Quick PoC)**: **IAM User Access Keys** (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`).

### Option A (Recommended): Configure AWS IAM OIDC Identity Provider

1. **Create the GitHub OIDC Provider in AWS IAM**:
   - Open the **AWS IAM Console** → **Identity providers** → **Add provider**.
   - Select **OpenID Connect**.
   - **Provider URL**: `https://token.actions.githubusercontent.com`
   - **Audience**: `sts.amazonaws.com`
   - Click **Add provider**.

2. **Create an IAM Role for GitHub Actions**:
   - Go to **IAM** → **Roles** → **Create role** → **Custom trust policy**.
   - Replace `<YOUR_AWS_ACCOUNT_ID>`, `<YOUR_GITHUB_USERNAME_OR_ORG>`, and `<YOUR_REPO_NAME>` in the trust policy below:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<YOUR_AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<YOUR_GITHUB_USERNAME_OR_ORG>/<YOUR_REPO_NAME>:*"
        }
      }
    }
  ]
}
```

3. **Attach Permissions to the IAM Role**:
   - Attach policies required by Terraform to provision the 11 AWS services (for an isolated sandbox/PoC AWS account, you can attach `PowerUserAccess` + `IAMFullAccess`, or a scoped Terraform deployment policy covering VPC, S3, KMS, Lake Formation, Athena, Glue, SageMaker, DynamoDB, MemoryDB, ECR, ECS, ALB, MWAA, and CloudWatch).
   - Name the role `GitHubActions-EcommerceRecs-Role` and copy its **Role ARN** (e.g., `arn:aws:iam::123456789012:role/GitHubActions-EcommerceRecs-Role`).
   - Save this ARN as the `AWS_ROLE_ARN` secret in GitHub (see Section 3).

---

### Option B (Alternative): Configure IAM User Access Keys

If you prefer using standard IAM Access Keys instead of OIDC:
1. Open **AWS IAM Console** → **Users** → **Create user** (e.g., `github-actions-terraform`).
2. Attach permissions required to deploy the Terraform stack.
3. Open the user → **Security credentials** → **Create access key** → Select **Command Line Interface (CLI)**.
4. Copy the `Access key ID` and `Secret access key` and store them as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in GitHub Secrets (leave `AWS_ROLE_ARN` unset).

---

## 3. Required GitHub Repository Secrets

In your GitHub repository, navigate to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, and add the following secrets:

| Secret Name | Required? | Description | Example Value |
| :--- | :---: | :--- | :--- |
| **`AWS_ROLE_ARN`** | **Required (Option A)** | IAM Role ARN assumed via GitHub OIDC (`aws-actions/configure-aws-credentials@v4`). If set, OIDC is used automatically. | `arn:aws:iam::123456789012:role/GitHubActions-EcommerceRecs-Role` |
| **`AWS_ACCESS_KEY_ID`** | **Required (Option B)** | IAM User Access Key ID (used only when `AWS_ROLE_ARN` is not set). | `AKIAIOSFODNN7EXAMPLE` |
| **`AWS_SECRET_ACCESS_KEY`** | **Required (Option B)** | IAM User Secret Access Key (used only when `AWS_ROLE_ARN` is not set). | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| **`AWS_REGION`** | **Required** | Target AWS region where Terraform will deploy all 11 services. | `us-east-1` |
| **`API_AUTH_TOKEN`** | *Optional (Recommended)* | Shared secret token enforced via the `x-api-key` HTTP header on `/v1/recommendations`. Used by the smoke test step in `terraform-create.yml`. | `rec-live-token-9f8e7d6c5b4a3210` |
| **`MEMORYDB_ACL_PASSWORD`** | *Optional (Production)* | Secret password when configuring SCRAM-SHA-256 user authentication on the MemoryDB ACL (`aws_memorydb_acl`). | `MemDB-Prod-S3cr3t!2026` |
| **`TF_STATE_BUCKET`** | *Optional (Remote State)* | S3 bucket name if you configure an S3 backend block for persistent remote Terraform state across workflow runs. | `my-org-terraform-state-us-east-1` |
| **`TF_STATE_LOCK_TABLE`** | *Optional (Remote State)* | DynamoDB table name for Terraform state locking when using an S3 backend. | `terraform-state-locks` |

---

## 4. Optional GitHub Repository Variables

In **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**, you can define non-sensitive configuration defaults:

| Variable Name | Default Value | Description |
| :--- | :---: | :--- |
| **`PROJECT_NAME`** | `ecommerce-recs` | Prefix applied to all AWS resources (`<project_name>-<environment>-...`). |
| **`ENVIRONMENT`** | `poc` | Deployment environment identifier (`poc`, `staging`, `prod`). |
| **`ENABLE_SERVERLESS_INFERENCE`** | `true` | Uses SageMaker Serverless Inference ($0 idle cost) when `true`, or provisioned `ml.t3.medium` when `false`. |
| **`ENABLE_MWAA`** | `false` | Keeps MWAA disabled during quick ephemeral CI runs (`false`) to save 25-minute environment creation time and $0.49/hr cost, or `true` for full Airflow cluster provisioning. |
| **`FORCE_DESTROY`** | `true` | Allows `terraform destroy` to automatically purge objects inside the S3 Golden Dataset bucket and images inside the ECR repository. |

---

## 5. How to Run the Workflows in GitHub

### 5.1 Continuous Integration (`CI - Build, Test & Validate`)
- Automatically runs on every `git push` or Pull Request.
- Verifies all TypeScript unit/contract/integration tests (`npm test`), ESLint (`npm run lint`), Python batch tests (`python -m unittest discover -s tests`), and Terraform syntax (`terraform validate`).

### 5.2 Ephemeral Deployment (`Terraform Create (Ephemeral Stack)`)
1. Go to your repository on GitHub → **Actions** tab.
2. Select **Terraform Create (Ephemeral Stack)** on the left sidebar.
3. Click **Run workflow**:
   - **Environment**: `poc`
   - **Enable Serverless Inference**: `true`
   - **Enable MWAA**: `false` (recommended for fast <5 min smoke test runs)
4. Click the green **Run workflow** button.
5. Watch the pipeline:
   - Provision the VPC, S3 Golden Dataset (KMS encrypted), Lake Formation, Athena Workgroup, Glue 4.0 jobs, SageMaker model/endpoint, DynamoDB table, MemoryDB cluster (TLS enabled), ECR repository, and ECS Fargate service behind an ALB.
   - Build `src/serving/Dockerfile` and push `:latest` to Amazon ECR.
   - Roll out the ECS Fargate task and execute live smoke tests against `http://<ALB_DNS>/health` and `http://<ALB_DNS>/v1/recommendations?userId=u-smoke-test&limit=5&sessionItemIds=SKU-1001,SKU-1002`.

### 5.3 Ephemeral Teardown (`Terraform Destroy (Ephemeral Stack)`)
1. Immediately after validating your deployment, go to **Actions** → **Terraform Destroy (Ephemeral Stack)**.
2. Click **Run workflow** → Set **Environment** to `poc` → Click **Run workflow**.
3. Confirm that all AWS resources are destroyed so your AWS account returns to **$0.00/hour** spend.

---

## 6. Note on Terraform State Persistence Between Create and Destroy Runs

By default, `infra/terraform/main.tf` uses a local backend so that `terraform validate` and local evaluations work out-of-the-box without requiring pre-existing AWS resources.  
When running **Terraform Create** followed later by **Terraform Destroy** in separate GitHub Actions runners (which use fresh ephemeral VMs), configure an **S3 Backend** in `infra/terraform/main.tf` so the state created in `terraform-create.yml` is accessible to `terraform-destroy.yml`:

```hcl
terraform {
  backend "s3" {
    bucket         = "your-tf-state-bucket-name"
    key            = "ecommerce-recs/poc/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "your-tf-state-lock-table"
    encrypt        = true
  }
}
```
Alternatively, you can run `terraform apply` and `terraform destroy` directly from your workstation CLI using the exact same commands shown in [README.md](file:///C:/Users/mrj84/Documents/Learning/exemplo-01-ecommerce-recomendations-aws-architecture/README.md).
