# Frequent Commands Reference

Day-to-day commands for infrastructure management. All commands work on macOS, Linux, and Windows.

**Replace `my-profile` with your AWS CLI profile name throughout.**

---

## CDK Commands

```bash
# Compile TypeScript
npm run build

# List all stacks
cdk list --profile my-profile

# Preview changes (dry-run)
cdk diff <StackName> --profile my-profile

# Generate CloudFormation template
cdk synth <StackName>

# Deploy a stack
cdk deploy <StackName> --profile my-profile

# Deploy multiple stacks
cdk deploy Stack1 Stack2 --profile my-profile

# Deploy all stacks
cdk deploy --all --profile my-profile

# Destroy a stack (careful!)
cdk destroy <StackName> --profile my-profile
```

---

## ECS

```bash
# List clusters
aws ecs list-clusters --profile my-profile

# Describe service health
aws ecs describe-services \
  --cluster <cluster-name> \
  --services <service-name> \
  --profile my-profile \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Force new deployment (pull latest image)
aws ecs update-service \
  --cluster <cluster-name> \
  --service <service-name> \
  --force-new-deployment \
  --profile my-profile

# Stop a task (ECS will auto-restart)
aws ecs stop-task \
  --cluster <cluster-name> \
  --task <task-id> \
  --reason "Manual restart" \
  --profile my-profile

# Exec into a running container
aws ecs execute-command \
  --cluster <cluster-name> \
  --task <task-id> \
  --container <container-name> \
  --command "/bin/sh" \
  --interactive \
  --profile my-profile
```

---

## CloudWatch Logs

```bash
# Tail logs in real-time
aws logs tail /ecs/<app-name>-<env> --follow --profile my-profile

# Logs from last hour
aws logs tail /ecs/<app-name>-<env> --since 1h --profile my-profile

# Filter for errors
aws logs tail /ecs/<app-name>-<env> --filter-pattern "ERROR" --follow --profile my-profile

# CodeBuild logs
aws logs tail /aws/codebuild/<app-name>-<env> --follow --profile my-profile
```

---

## ECR (Container Registry)

```bash
# Login to ECR
aws ecr get-login-password --region <region> --profile my-profile | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com

# List images
aws ecr list-images --repository-name <repo-name> --profile my-profile

# Build, tag, and push manually
docker build -t <repo-name>:latest .
docker tag <repo-name>:latest <account-id>.dkr.ecr.<region>.amazonaws.com/<repo-name>:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/<repo-name>:latest
```

---

## CodePipeline

```bash
# List pipelines
aws codepipeline list-pipelines --profile my-profile

# Get pipeline status
aws codepipeline get-pipeline-state --name <pipeline-name> --profile my-profile

# Manually trigger pipeline
aws codepipeline start-pipeline-execution --name <pipeline-name> --profile my-profile

# Retry a failed stage
aws codepipeline retry-stage-execution \
  --pipeline-name <pipeline-name> \
  --stage-name Build \
  --pipeline-execution-id <execution-id> \
  --retry-mode FAILED_ACTIONS \
  --profile my-profile
```

---

## SSM Parameter Store

```bash
# List parameters for a project
aws ssm describe-parameters \
  --parameter-filters "Key=Name,Option=BeginsWith,Values=/<project-name>/" \
  --profile my-profile

# Get parameter value
aws ssm get-parameter --name "/<project>/<env>/SECRET_KEY" --with-decryption --profile my-profile

# Create/update parameter
aws ssm put-parameter \
  --name "/<project>/<env>/SECRET_KEY" \
  --value "new-value" \
  --type SecureString \
  --overwrite \
  --profile my-profile

# Delete parameter
aws ssm delete-parameter --name "/<project>/<env>/OLD_KEY" --profile my-profile
```

---

## ALB & Target Groups

```bash
# List ALBs
aws elbv2 describe-load-balancers --profile my-profile

# Check target health
aws elbv2 describe-target-health --target-group-arn <tg-arn> --profile my-profile

# List listener rules
aws elbv2 describe-rules --listener-arn <listener-arn> --profile my-profile
```

---

## CloudFormation

```bash
# List active stacks
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --profile my-profile

# Get stack outputs
aws cloudformation describe-stacks --stack-name <StackName> \
  --query 'Stacks[0].Outputs' --profile my-profile

# View recent stack events (debug deploy failures)
aws cloudformation describe-stack-events --stack-name <StackName> \
  --max-items 20 --profile my-profile
```

---

## CloudWatch Alarms

```bash
# List all alarms
aws cloudwatch describe-alarms --profile my-profile

# List alarms currently firing
aws cloudwatch describe-alarms --state-value ALARM --profile my-profile
```

---

## Docker

```bash
# Build image
docker build -t my-app:latest .

# Run locally
docker run -it --rm -p 8000:8000 my-app:latest

# Run with env vars
docker run -p 8000:8000 -e DATABASE_URL=postgres://localhost/db my-app:latest

# View running containers
docker ps

# View logs
docker logs -f <container-id>

# Clean up
docker system prune -a
```

---

## Git

```bash
# Status and branches
git status
git branch -a
git log --oneline -10

# Branch workflow
git checkout -b feature/my-feature
git add <files>
git commit -m "description"
git push -u origin feature/my-feature

# Stay up to date
git pull origin main
```

---

## Quick Reference

| Task | Command |
|---|---|
| Compile | `npm run build` |
| List stacks | `cdk list --profile my-profile` |
| Preview changes | `cdk diff <Stack> --profile my-profile` |
| Deploy | `cdk deploy <Stack> --profile my-profile` |
| Tail ECS logs | `aws logs tail /ecs/<app>-<env> --follow --profile my-profile` |
| Service health | `aws ecs describe-services --cluster <c> --services <s> --profile my-profile` |
| Force deploy | `aws ecs update-service --cluster <c> --service <s> --force-new-deployment --profile my-profile` |
| Trigger pipeline | `aws codepipeline start-pipeline-execution --name <p> --profile my-profile` |
| Check identity | `aws sts get-caller-identity --profile my-profile` |
