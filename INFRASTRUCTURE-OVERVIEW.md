# Infrastructure Overview

Architecture overview and cost analysis for the CDK infrastructure.

---

## Architecture Diagram

```
Internet
   |
   v
+---------------------------------------------------------------+
| Application Load Balancer (Public Subnets)                     |
| - HTTP :80  -> fixed 404 (or redirect to HTTPS)               |
| - HTTPS :443 -> listener rules route by host header            |
+-----------------------------+---------------------------------+
                              |
                              v
        +------------------------------------------+
        | ECS Fargate Service (Private Subnets)     |
        | - Pulls image from ECR                    |
        | - Loads secrets from SSM Parameter Store   |
        | - Writes logs to CloudWatch               |
        | - Optional: Redis via ElastiCache         |
        | - Optional: Celery sidecars               |
        +------------------------------------------+

CI/CD Pipeline:
GitHub push -> CodePipeline -> CodeBuild (docker build) -> ECS deploy
```

---

## Technology Stack

| Component | AWS Service | Purpose |
|---|---|---|
| **Network** | VPC | Isolated network with public/private subnets across 2 AZs |
| **NAT** | NAT Gateway (x1) | Private subnet internet access, single for cost optimization |
| **Load Balancer** | ALB | HTTPS termination, host-based routing, health checks |
| **Compute** | ECS Fargate | Serverless container orchestration, no EC2 management |
| **Container Registry** | ECR | Private Docker images with vulnerability scanning |
| **CI/CD** | CodePipeline + CodeBuild | Automated GitHub -> build -> deploy pipeline |
| **Source Integration** | CodeConnections | OAuth-based GitHub integration (no tokens/keys) |
| **Secrets** | SSM Parameter Store | Free-tier secret storage for env vars |
| **Certificates** | ACM | Wildcard SSL certificates with DNS validation |
| **DNS** | Route53 | Subdomain A-record aliases to ALBs |
| **Caching** | ElastiCache Redis | Optional in-VPC Redis (cache, Celery broker) |
| **Cron** | EventBridge + Fargate | Scheduled container tasks |
| **Monitoring** | CloudWatch Alarms + SNS | CPU, memory, unhealthy target, and pipeline failure alerts |
| **Logging** | CloudWatch Logs | Centralized ECS + CodeBuild logs with retention policies |
| **Artifacts** | S3 | Pipeline artifact storage with 30-day lifecycle |

---

## Network Design

- **CIDR:** 10.0.0.0/16 (65,536 IPs)
- **AZs:** 2 (e.g. us-east-1a, us-east-1b)
- **Public subnets:** ALB, NAT Gateway
- **Private subnets:** ECS tasks, ElastiCache
- **NAT Gateways:** 1 (cost-optimized; increase to 2 for production HA)
- **VPC Endpoints:** S3 Gateway (free) — other AWS traffic goes via NAT
- **Flow Logs:** All traffic logged to CloudWatch

---

## Routing Model

Domain-based routing via shared ALBs:

```
https://app-staging.example.com  ->  Staging ALB  ->  App Staging ECS
https://api-staging.example.com  ->  Staging ALB  ->  API Staging ECS
https://app.example.com          ->  Production ALB -> App Production ECS
```

Each service registers a listener rule with a unique priority and host-header condition on the shared ALB's HTTPS listener. A single wildcard ACM certificate (`*.example.com`) covers all subdomains.

---

## Environments

| Environment | ALB | Branch | Log Retention | Auto-Scale Max |
|---|---|---|---|---|
| **Dev** | Staging ALB | `dev` | 7 days | 2 |
| **Staging** | Staging ALB | `staging` | 14 days | 3 |
| **Production** | Production ALB | `main` | 30 days | 3 |

---

## Security Features

1. **Network Isolation** — ECS in private subnets, ALB in public subnets
2. **Least-Privilege IAM** — Scoped roles for ECS execution, task runtime, and CodeBuild
3. **Encryption at Rest** — ECR images (AES-256), S3 artifacts (S3-managed)
4. **VPC Flow Logs** — Network traffic auditing
5. **Image Scanning** — ECR vulnerability scanning on every push
6. **No Hardcoded Secrets** — All credentials in SSM Parameter Store
7. **Security Groups** — ECS only accepts traffic from ALB; ALB only on 80/443

---

## Cost Breakdown (Staging, Single Service)

| Service | Monthly Cost |
|---|---|
| VPC & Subnets | $0 |
| NAT Gateway | ~$37 |
| ALB | ~$17 |
| ECS Fargate (1 task, 0.5 vCPU, 1GB) | ~$21 |
| ECR + S3 + Logs | ~$3 |
| CodePipeline (1st free) + CodeBuild | ~$1 |
| Alarms, SNS, SSM, IAM | $0 |
| **Total (infra + 1 service)** | **~$79/month** |

Each additional service on the same ALB adds ~$18-23/month (ECS + storage + logs).

### Cost Optimizations Applied

- Single NAT Gateway (saves ~$32/month vs HA)
- No VPC Interface Endpoints (saves ~$57/month)
- S3 Gateway Endpoint (free)
- SSM Parameter Store Standard tier (free vs Secrets Manager)
- Small Fargate task sizes
- Log retention limits
- S3 lifecycle rules (auto-delete after 30 days)

---

## Stacks Overview

| Stack | Purpose | Dependencies |
|---|---|---|
| `NetworkingStack` | VPC, subnets, security groups | None |
| `StagingCertificateStack` | Wildcard SSL cert for staging | None |
| `ProductionCertificateStack` | Wildcard SSL cert for production | None |
| `StagingAlbStack` | Shared staging/dev ALB | Networking, StagingCert |
| `ProductionAlbStack` | Shared production ALB | Networking, ProductionCert |
| `*SharedStack` | Per-project ECR, S3, SNS | None |
| `*StagingStack` / `*ProductionStack` | Per-project pipeline + ECS | ALB, SharedStack |
| `StagingDnsStack` | Route53 records for staging | StagingAlb |
| `ProductionDnsStack` | Route53 records for production | ProductionAlb |

---

## Technology Decisions

| Requirement | Choice | Reasoning |
|---|---|---|
| Compute | ECS Fargate | No server management, auto-scaling, pay-per-use |
| Networking | Custom VPC | Security isolation, multi-AZ, private subnets |
| NAT | 1 NAT Gateway | Cost-optimized for non-prod; scale to 2 for HA |
| Load Balancer | ALB | Required for Fargate, HTTP routing, health checks |
| Registry | ECR | Native ECS integration, vulnerability scanning |
| Secrets | SSM Standard | Free tier, sufficient for most workloads |
| CI/CD | CodePipeline | Native AWS integration, serverless |
| Build | CodeBuild | Pay-per-build, no Jenkins server to maintain |
| Monitoring | CloudWatch | Native integration, free tier for alarms |
