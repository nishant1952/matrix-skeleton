# matrix-skeleton

AWS CDK Infrastructure-as-Code skeleton for deploying containerised services on ECS Fargate with full CI/CD pipelines.

## What's included

| Stack | Purpose |
|---|---|
| **NetworkingStack** | VPC (2 AZs, 1 NAT), public/private subnets, ALB + ECS security groups |
| **CertificateStack** | ACM wildcard certificate with DNS validation |
| **StagingAlbStack / ProductionAlbStack** | Shared ALBs with HTTP + HTTPS listeners |
| **SharedResourcesStack** | Per-project ECR repo, S3 artifact bucket, SNS alarm topic |
| **PipelineStack** | GitHub -> CodeBuild -> ECS Fargate deploy with CloudWatch alarms |
| **ElastiCacheStack** | Single-node Redis 7.0 in private subnets |
| **ScheduledTaskStack** | EventBridge-triggered Fargate tasks (cron jobs) |
| **DnsStack** | Route53 A-record aliases for subdomain -> ALB routing |

## Getting started

1. Update `config/common.json` with your AWS account ID, region, hosted zone, and GitHub connection ARN.
2. Update `config/projects.json` with your project details.
3. Install dependencies and deploy:

```bash
npm install
npx cdk synth          # validate templates
npx cdk deploy --all   # deploy everything
```

## Adding a new service

1. Add a new entry to `config/projects.json`.
2. In `bin/matrix.ts`, create a `SharedResourcesStack` and `PipelineStack` for each environment.
3. Wire it to the appropriate ALB and add DNS records.

## Project structure

```
bin/matrix.ts              # CDK app entry point — wires all stacks
config/                    # Environment and project configuration
  common.json              # Account, region, hosted zone, tags
  dev.json                 # Dev environment settings
  staging.json             # Staging environment settings
  production.json          # Production environment settings
  projects.json            # Project definitions (repos, ports, env vars)
lib/
  networking/              # VPC, subnets, security groups
  alb/                     # Shared ALBs (staging + production)
  shared/                  # Reusable stacks (certs, DNS, ECR, Redis, cron)
  pipeline/                # CI/CD pipeline stack
test/                      # CDK tests
```
