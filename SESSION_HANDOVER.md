# Contexto da Sessão e Handover: Plataforma Híbrida de Recomendação AWS

**Data**: 05 de Novembro de 2026  
**Branch Git Ativa**: `001-aws-recommendation-platform`  
**Diretório da Feature**: `specs/001-aws-recommendation-platform`  
**Status Atual**: `/speckit-implement` **em andamento**. Fase 1 (Setup) 100% concluída. Fase 2 (Foundational) iniciada.

---

## 1. Visão Geral do Projeto & Arquitetura Fixa

Construção de uma **Plataforma Híbrida de Recomendação E-Commerce** (para usuários da Amazon.com) combinando batch offline, vetores semânticos em tempo real e re-ranqueamento ML:
1. Geração de recomendações em lote offline (Batch Layer).
2. Recuperação semântica em tempo real via busca vetorial (Realtime Layer).
3. Re-ranqueamento e pontuação ML online.
4. Filtragem determinística de regras de negócio (estoque, compras recentes, restrições).
5. Degradação suave e fallback automático com zero erros 500 para o cliente.

### Arquitetura Aprovada (11 Serviços AWS - Imutável)
- **Batch Layer**: Amazon S3 (Golden Dataset), AWS Lake Formation, Amazon MWAA, Amazon Athena, AWS Glue 4.0, Amazon SageMaker (Managed Spot), Amazon DynamoDB (`user_recommendations`, On-Demand, TTL 7 dias).
- **Realtime Layer**: Amazon MemoryDB for Redis (HNSW `item_idx`, 128-dim FLOAT32), Amazon SageMaker Serverless Inference ($0 idle), Amazon ECS (Fargate Spot, Node.js 20 LTS / TypeScript 5.4+ / Fastify v4).
- **Ingresso & Observabilidade**: Application Load Balancer (ALB), Amazon CloudWatch.

---

## 2. Progresso da Implementação (`/speckit-implement`)

### ✅ Fase 1: Setup Compartilhado (Concluída - 5/5)
- [x] **`T001`**: `package.json` raiz do monorepo com workspace `src/serving`, scripts de build e teste.
- [x] **`T002`**: `tsconfig.json` e `src/serving/tsconfig.json` configurados com ES2022/Node20 em modo estrito.
- [x] **`T003`**: `.eslintrc.json`, `.prettierrc` e `vitest.config.ts`.
- [x] **`T004`**: Validação de ambiente via Zod em `src/serving/src/config/env.ts` (`PORT`, `AWS_REGION`, etc.).
- [x] **`T005`**: Raiz do Terraform em `infra/terraform/main.tf`, `variables.tf` e `outputs.tf` com AWS provider `>= 5.0`.
- [x] Instalação de dependências npm (`npm install`) realizada com sucesso no workspace.
- [x] Criação de arquivos de ignore do projeto: `.gitignore`, `.dockerignore`, `.eslintignore`, `.prettierignore`.

### ⏳ Fase 2: Fundações Bloqueantes (Em Andamento - 2/9)
- [x] **`T006`**: Modelos de domínio essenciais e schemas Zod em `src/serving/src/domain/candidate.ts` (`MergedCandidate`, `CandidateProvenance`, `RecommendedItem`, `UserIdSchema`).
- [x] **`T007`**: Logger JSON estruturado Pino com rastreamento de correlação e temporizador de latência em estágios em `src/serving/src/infrastructure/logging/logger.ts`.
- [ ] **`T008` (Próximo)**: Circuit breaker e retry utility com `opossum` em `src/serving/src/infrastructure/resilience/circuit-breaker.ts`.
- [ ] **`T009`**: Cache LRU em memória em `src/serving/src/infrastructure/cache/lru-cache.provider.ts`.
- [ ] **`T010`**: Servidor Fastify em `src/serving/src/presentation/server.ts`.
- [ ] **`T011`**: Controller `/health` em `src/serving/src/presentation/controllers/health.controller.ts`.
- [ ] **`T012`**: Módulo Terraform de networking (VPC, subnets, S3 VPC Endpoint) em `infra/terraform/modules/networking/main.tf`.
- [ ] **`T013`**: Módulo Terraform S3 Golden Dataset em `infra/terraform/modules/s3_golden_dataset/main.tf`.
- [ ] **`T014`**: Módulo Terraform Lake Formation em `infra/terraform/modules/lake_formation/main.tf`.

---

## 3. Estado das Ferramentas de Suporte e MCPs

| Ferramenta | Status | Configuração & Integração |
| :--- | :---: | :--- |
| **AgentMemory** | **Conectado & Sincronizado** | REST em `:3111`, Viewer em `:3113`. Memória `mem_mw327qjb_87e3c4d8ceba` registrada com o snapshot do progresso da implementação. |
| **Headroom** | **Conectado & Ativo** | Proxy ativo em `http://127.0.0.1:8787` (`/readyz` pronto). |
| **RTK** | **Ativo** | Redução de tokens de terminal em ~58% via plugin `.gemini/config/plugins/rtk`. |
| **AWS MCP** | **Instalado & Operacional** | `awslabs.aws-api-mcp-server` via `uvx` autenticado com perfil `devops`. |

---

## 4. Próximos Passos para Retomar

Ao continuar, o agente deve seguir diretamente a partir da tarefa **`T008`**:

1. **Implementar `T008`**: Circuit breaker Opossum em `src/serving/src/infrastructure/resilience/circuit-breaker.ts`.
2. **Implementar `T009`–`T014`**: Finalizar a Fase 2 (Cache LRU, Fastify server, health controller, e módulos Terraform base de networking/S3/Lake Formation).
3. **Executar Fase 3 (User Story 1 - MVP)**:
   - Testes TDD: `T015` (unitário candidate merger), `T016` (contrato OpenAPI), `T017` (integração).
   - Implementação dos adaptadores (`T018`–`T020`), casos de uso (`T021`–`T023`), controller (`T024`), módulos Terraform (`T025`–`T028`) e Dockerfile (`T029`).
4. **Executar Fases 4 a 7** na ordem de dependências do [`tasks.md`](specs/001-aws-recommendation-platform/tasks.md).
