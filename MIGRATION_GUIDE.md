# Windows Folder Migration Guide & Project State

## 1. Project Overview & Current State
- **Project**: AWS Hybrid Recommendation Platform (E-Commerce)
- **Feature**: `001-aws-recommendation-platform`
- **Status**: **CONVERGED (100%)** — All 67 tasks completed across Phases 1 through 8.
- **Test Pass Rate**:
  - TypeScript/Vitest: 9 suites, 21 unit/contract/integration tests passing.
  - Python unittest: 14 batch/Airflow/contract tests passing.
  - ESLint: 0 errors, 0 warnings.
  - Terraform: All 11 modules wired, formatted, and validated.
- **AgentMemory Project Identifier**: `ecommerce-recommendations-aws-architecture`

---

## 2. Why Moving Folder on Windows Is Beneficial
1. **Shortens Path Length**: Reduces previous path (149 chars) to avoid Windows `MAX_PATH` (260 chars) issues in `node_modules` and `.terraform`.
2. **Removes Accented Characters**: Removes `Pós` from parent directory path, preventing Unicode encoding friction with Git Bash, Python virtual environments, and CLI tools.

---

## 3. Step-by-Step Post-Move Execution

Open **PowerShell** in the new destination folder:

```powershell
# 1. (Optional) Initialize as standalone git repo if moved outside parent repo
git init
git add .
git commit -m "feat: complete AWS hybrid recommendation platform"

# 2. Re-install & compile serving service
npm install
npm run build

# 3. Verify all test suites
npm test
python -m unittest discover -s tests

# 4. Refresh Terraform module pointers
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform validate
```

---

## 4. Launching New AGY Session

In the new directory:
```powershell
cd <NEW_PROJECT_PATH>
agy
```

To prime the new session with full historical context, send:
> "Read MIGRATION_GUIDE.md and recall project context from agentmemory for project 'ecommerce-recommendations-aws-architecture'."
