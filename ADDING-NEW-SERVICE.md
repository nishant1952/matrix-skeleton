# Adding a New Service

Step-by-step guide for adding a new application to the infrastructure.

---

## Prerequisites

- [ ] Application repository with a working `Dockerfile`
- [ ] Application exposes an HTTP health check endpoint
- [ ] Application listens on a specific port (e.g. 3000, 5000, 8000)
- [ ] GitHub repository accessible via your CodeConnections connection
- [ ] AWS CLI configured and CDK installed

---

## Step 1: Prepare Your Application Repository

### 1.1 Dockerfile

Ensure your app repo has a working `Dockerfile`:

```dockerfile
# Example: Node.js
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```dockerfile
# Example: Python/Django
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "myapp.wsgi:application", "--bind", "0.0.0.0:8000"]
```

### 1.2 buildspec.yml

Add `buildspec.yml` to the **root** of your application repository:

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URI
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Building the Docker image...
      - docker build -t $ECR_REPOSITORY_URI:$ENV .
      - docker tag $ECR_REPOSITORY_URI:$ENV $ECR_REPOSITORY_URI:$IMAGE_TAG
  post_build:
    commands:
      - echo Pushing the Docker images...
      - docker push $ECR_REPOSITORY_URI:$ENV
      - docker push $ECR_REPOSITORY_URI:$IMAGE_TAG
      - printf '[{"name":"%s-%s-container","imageUri":"%s"}]' $PROJECT_NAME $ENV $ECR_REPOSITORY_URI:$ENV > imagedefinitions.json

artifacts:
  files: imagedefinitions.json
```

The container name format is `{project-name}-{environment}-container` (e.g. `my-api-staging-container`).

### 1.3 Create Environment Branches

```bash
git checkout -b staging && git push -u origin staging
git checkout -b dev && git push -u origin dev
```

---

## Step 2: Add Project Configuration

Edit `config/projects.json` and add your new project:

```json
{
  "exampleApp": { ... },
  "myNewApp": {
    "name": "my-new-app",
    "displayName": "My New Application",
    "githubRepo": "my-org/my-new-app",
    "ecrRepositoryName": "my-new-app",
    "containerPort": 3000,
    "healthCheckPath": "/health",
    "healthCheckInterval": 30,
    "healthCheckTimeout": 5,
    "healthyThresholdCount": 2,
    "unhealthyThresholdCount": 3,
    "environments": ["staging", "production"],
    "domains": {
      "staging": "my-app-staging.example.com",
      "production": "my-app.example.com"
    },
    "alarmEmail": "alerts@example.com",
    "requiredEnvVars": [
      "SECRET_KEY",
      "DATABASE_URL"
    ]
  }
}
```

---

## Step 3: Add Infrastructure Stacks

Edit `bin/matrix.ts`:

### 3.1 Shared Resources

```typescript
const myNewAppSharedStack = new SharedResourcesStack(
  app, 'MyNewAppSharedStack', {
    env: env,
    projectName: projectsConfig.myNewApp.name,
    ecrRepositoryName: projectsConfig.myNewApp.ecrRepositoryName,
    alarmEmail: projectsConfig.myNewApp.alarmEmail,
    description: 'Shared resources for My New App (ECR, S3, SNS)',
    tags: { ...commonConfig.tags, Project: projectsConfig.myNewApp.name },
  }
);
```

### 3.2 Pipeline Stack (per environment)

```typescript
const myNewAppStagingStack = new PipelineStack(
  app, 'MyNewAppStagingStack', {
    env: env,
    projectName: projectsConfig.myNewApp.name,
    environment: stagingConfig.environment,
    vpc: networkingStack.vpc,
    ecsSecurityGroup: networkingStack.ecsSecurityGroup,
    alb: stagingAlbStack.alb,
    httpListener: stagingAlbStack.httpsListener,
    listenerRulePriority: 200,           // Must be unique!
    hostHeader: projectsConfig.myNewApp.domains.staging,
    ecrRepository: myNewAppSharedStack.ecrRepository,
    artifactBucket: myNewAppSharedStack.artifactBucket,
    alarmTopic: myNewAppSharedStack.alarmTopic,
    githubConnection: commonConfig.githubConnection,
    githubRepo: projectsConfig.myNewApp.githubRepo,
    githubBranch: stagingConfig.githubBranch,
    containerPort: projectsConfig.myNewApp.containerPort,
    healthCheckPath: projectsConfig.myNewApp.healthCheckPath,
    requiredEnvVars: projectsConfig.myNewApp.requiredEnvVars,
    fargateConfig: stagingConfig.fargate,
    autoScalingConfig: stagingConfig.autoScaling,
    loggingConfig: stagingConfig.logging,
    description: 'CI/CD pipeline for My New App staging',
    tags: {
      ...commonConfig.tags,
      Project: projectsConfig.myNewApp.name,
      Environment: stagingConfig.environment,
    },
  }
);
myNewAppStagingStack.addDependency(stagingAlbStack);
myNewAppStagingStack.addDependency(myNewAppSharedStack);
```

### 3.3 DNS Record

Add to the staging DNS stack's `records` array:

```typescript
{ subdomain: 'my-app-staging', alb: stagingAlbStack.alb },
```

### 3.4 Listener Rule Priority

Each service needs a **unique** priority. Lower numbers are checked first.

| Priority | Service |
|---|---|
| 100 | Example App |
| 200 | My New App (staging) |
| 300 | Next service... |

---

## Step 4: Update Security Group (if needed)

If your app uses a port not already allowed (8000 and 5000 are pre-configured), add it in `lib/networking/networking-stack.ts`:

```typescript
this.ecsSecurityGroup.addIngressRule(
  this.albSecurityGroup,
  ec2.Port.tcp(3000),
  'Allow traffic from ALB to ECS tasks on port 3000'
);
```

---

## Step 5: Create SSM Parameters

Store your app's secrets in AWS SSM Parameter Store:

```bash
aws ssm put-parameter \
  --name "/my-new-app/staging/SECRET_KEY" \
  --value "your-secret-value" \
  --type SecureString \
  --profile my-profile

aws ssm put-parameter \
  --name "/my-new-app/staging/DATABASE_URL" \
  --value "postgresql://user:pass@host:5432/db" \
  --type SecureString \
  --profile my-profile
```

Format: `/{project-name}/{environment}/{VAR_NAME}`

---

## Step 6: Build, Verify, Deploy

```bash
# Compile
npm run build

# Verify stacks appear
cdk list --profile my-profile

# Preview what will be created
cdk diff MyNewAppSharedStack --profile my-profile
cdk diff MyNewAppStagingStack --profile my-profile

# Deploy (shared resources first)
cdk deploy MyNewAppSharedStack --profile my-profile
cdk deploy MyNewAppStagingStack --profile my-profile
```

---

## Step 7: Push Initial Image & Trigger Pipeline

Push code to your staging branch — the pipeline will build and deploy automatically:

```bash
cd /path/to/my-new-app
git push origin staging
```

Monitor in AWS Console: **CodePipeline** > `my-new-app-staging-pipeline`

---

## Verification

```bash
# Check ECS service health
aws ecs describe-services \
  --cluster my-new-app-staging-cluster \
  --services my-new-app-staging-service \
  --profile my-profile \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Tail application logs
aws logs tail /ecs/my-new-app-staging --follow --profile my-profile

# Test the endpoint
curl https://my-app-staging.example.com/health
```

---

## Cost Estimate Per Service

| Resource | Monthly Cost |
|---|---|
| ECS Fargate (1 task, 0.5 vCPU, 1GB) | ~$15-20 |
| S3 artifacts | ~$1 |
| ECR storage | ~$1 |
| CloudWatch logs | ~$1 |
| **Total per service** | **~$18-23/month** |

Shared resources (VPC, ALB, NAT) incur no additional cost per service.

---

## Troubleshooting

| Issue | Check |
|---|---|
| ECS tasks keep failing | `aws logs tail /ecs/my-new-app-staging --follow` — look for startup errors |
| Health checks failing | Verify health check path returns 200. Check security group allows the port. |
| Pipeline fails at Build | Check buildspec.yml syntax. View CodeBuild logs. |
| 404 on the domain | Verify DNS record exists, listener rule priority is unique, and ALB has healthy targets |
