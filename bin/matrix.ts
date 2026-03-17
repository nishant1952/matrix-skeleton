#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking/networking-stack';
import { SharedResourcesStack } from '../lib/shared/shared-resources-stack';
import { CertificateStack } from '../lib/shared/certificate-stack';
import { PipelineStack } from '../lib/pipeline/pipeline-stack';
import { StagingAlbStack } from '../lib/alb/staging-alb-stack';
import { ProductionAlbStack } from '../lib/alb/production-alb-stack';
import { DnsStack } from '../lib/shared/dns-stack';
import { ElastiCacheStack } from '../lib/shared/elasticache-stack';
import { ScheduledTaskStack } from '../lib/shared/scheduled-task-stack';
import { MonitoringStack } from '../lib/shared/monitoring-stack';
import * as events from 'aws-cdk-lib/aws-events';

// Import configuration
import * as commonConfig from '../config/common.json';
import * as projectsConfig from '../config/projects.json';
import * as devConfig from '../config/dev.json';
import * as stagingConfig from '../config/staging.json';
import * as productionConfig from '../config/production.json';

const app = new cdk.App();

// Define environment
const env = {
  account: commonConfig.accountId,
  region: commonConfig.region,
};

// ─── Networking ──────────────────────────────────────────────────────────────
const networkingStack = new NetworkingStack(app, 'NetworkingStack', {
  env: env,
  description: 'VPC, subnets, security groups, and VPC endpoints',
  tags: commonConfig.tags,
});

// ─── Certificates ────────────────────────────────────────────────────────────
const stagingCertificateStack = new CertificateStack(
  app,
  'StagingCertificateStack',
  {
    env: env,
    domainName: `*.${commonConfig.hostedZone.name}`,
    hostedZoneId: commonConfig.hostedZone.id,
    hostedZoneName: commonConfig.hostedZone.name,
    description: 'Wildcard SSL certificate for staging and dev environments',
    tags: {
      ...commonConfig.tags,
      Environment: 'staging',
    },
  }
);

const productionCertificateStack = new CertificateStack(
  app,
  'ProductionCertificateStack',
  {
    env: env,
    domainName: `*.${commonConfig.hostedZone.name}`,
    hostedZoneId: commonConfig.hostedZone.id,
    hostedZoneName: commonConfig.hostedZone.name,
    description: 'Wildcard SSL certificate for production environment',
    tags: {
      ...commonConfig.tags,
      Environment: 'production',
    },
  }
);

// ─── ALB Stacks ──────────────────────────────────────────────────────────────
const stagingAlbStack = new StagingAlbStack(app, 'StagingAlbStack', {
  env: env,
  vpc: networkingStack.vpc,
  albSecurityGroup: networkingStack.albSecurityGroup,
  certificate: stagingCertificateStack.certificate,
  description: 'Shared ALB for staging and dev environments',
  tags: {
    ...commonConfig.tags,
    Environment: 'staging',
  },
});
stagingAlbStack.addDependency(networkingStack);
stagingAlbStack.addDependency(stagingCertificateStack);

const productionAlbStack = new ProductionAlbStack(app, 'ProductionAlbStack', {
  env: env,
  vpc: networkingStack.vpc,
  albSecurityGroup: networkingStack.albSecurityGroup,
  certificate: productionCertificateStack.certificate,
  description: 'Shared ALB for production environment',
  tags: {
    ...commonConfig.tags,
    Environment: 'production',
  },
});
productionAlbStack.addDependency(networkingStack);
productionAlbStack.addDependency(productionCertificateStack);

// ─── Example App ─────────────────────────────────────────────────────────────
// Shared resources (ECR, S3, SNS) for the example project
const exampleAppSharedStack = new SharedResourcesStack(
  app,
  'ExampleAppSharedStack',
  {
    env: env,
    projectName: projectsConfig.exampleApp.name,
    ecrRepositoryName: projectsConfig.exampleApp.ecrRepositoryName,
    alarmEmail: projectsConfig.exampleApp.alarmEmail,
    description: 'Shared resources for Example App (ECR, S3, SNS)',
    tags: {
      ...commonConfig.tags,
      Project: projectsConfig.exampleApp.name,
    },
  }
);

// Example App — Staging Pipeline
const exampleAppStagingStack = new PipelineStack(
  app,
  'ExampleAppStagingStack',
  {
    env: env,
    projectName: projectsConfig.exampleApp.name,
    environment: stagingConfig.environment,
    vpc: networkingStack.vpc,
    ecsSecurityGroup: networkingStack.ecsSecurityGroup,
    alb: stagingAlbStack.alb,
    httpListener: stagingAlbStack.httpsListener,
    listenerRulePriority: 100,
    hostHeader: projectsConfig.exampleApp.domains.staging,
    ecrRepository: exampleAppSharedStack.ecrRepository,
    artifactBucket: exampleAppSharedStack.artifactBucket,
    alarmTopic: exampleAppSharedStack.alarmTopic,
    githubConnection: commonConfig.githubConnection,
    githubRepo: projectsConfig.exampleApp.githubRepo,
    githubBranch: stagingConfig.githubBranch,
    containerPort: projectsConfig.exampleApp.containerPort,
    healthCheckPath: projectsConfig.exampleApp.healthCheckPath,
    requiredEnvVars: projectsConfig.exampleApp.requiredEnvVars,
    fargateConfig: stagingConfig.fargate,
    autoScalingConfig: stagingConfig.autoScaling,
    loggingConfig: stagingConfig.logging,
    description: 'CI/CD pipeline for Example App staging environment',
    tags: {
      ...commonConfig.tags,
      Project: projectsConfig.exampleApp.name,
      Environment: stagingConfig.environment,
    },
  }
);
exampleAppStagingStack.addDependency(stagingAlbStack);
exampleAppStagingStack.addDependency(exampleAppSharedStack);

// Example App — Production Pipeline
const exampleAppProductionStack = new PipelineStack(
  app,
  'ExampleAppProductionStack',
  {
    env: env,
    projectName: projectsConfig.exampleApp.name,
    environment: productionConfig.environment,
    vpc: networkingStack.vpc,
    ecsSecurityGroup: networkingStack.ecsSecurityGroup,
    alb: productionAlbStack.alb,
    httpListener: productionAlbStack.httpsListener,
    listenerRulePriority: 100,
    hostHeader: projectsConfig.exampleApp.domains.production,
    ecrRepository: exampleAppSharedStack.ecrRepository,
    artifactBucket: exampleAppSharedStack.artifactBucket,
    alarmTopic: exampleAppSharedStack.alarmTopic,
    githubConnection: commonConfig.githubConnection,
    githubRepo: projectsConfig.exampleApp.githubRepo,
    githubBranch: productionConfig.githubBranch,
    containerPort: projectsConfig.exampleApp.containerPort,
    healthCheckPath: projectsConfig.exampleApp.healthCheckPath,
    requiredEnvVars: projectsConfig.exampleApp.requiredEnvVars,
    fargateConfig: productionConfig.fargate,
    autoScalingConfig: productionConfig.autoScaling,
    loggingConfig: productionConfig.logging,
    description: 'CI/CD pipeline for Example App production environment',
    tags: {
      ...commonConfig.tags,
      Project: projectsConfig.exampleApp.name,
      Environment: productionConfig.environment,
    },
  }
);
exampleAppProductionStack.addDependency(productionAlbStack);
exampleAppProductionStack.addDependency(exampleAppSharedStack);

// ─── DNS ─────────────────────────────────────────────────────────────────────
const stagingDnsStack = new DnsStack(app, 'StagingDnsStack', {
  env: env,
  hostedZoneId: commonConfig.hostedZone.id,
  hostedZoneName: commonConfig.hostedZone.name,
  records: [
    {
      subdomain: 'app-staging',
      alb: stagingAlbStack.alb,
    },
  ],
  description: 'Route53 DNS records for staging/dev domain-based services',
  tags: {
    ...commonConfig.tags,
    Environment: 'staging',
  },
});
stagingDnsStack.addDependency(stagingAlbStack);

const productionDnsStack = new DnsStack(app, 'ProductionDnsStack', {
  env: env,
  hostedZoneId: commonConfig.hostedZone.id,
  hostedZoneName: commonConfig.hostedZone.name,
  records: [
    {
      subdomain: 'app',
      alb: productionAlbStack.alb,
    },
  ],
  description: 'Route53 DNS records for production domain-based services',
  tags: {
    ...commonConfig.tags,
    Environment: 'production',
  },
});
productionDnsStack.addDependency(productionAlbStack);

// ─── Optional: ElastiCache Redis (uncomment to use) ─────────────────────────
// const exampleRedisStack = new ElastiCacheStack(app, 'ExampleAppRedisStack', {
//   env: env,
//   vpc: networkingStack.vpc,
//   ecsSecurityGroup: networkingStack.ecsSecurityGroup,
//   projectName: projectsConfig.exampleApp.name,
//   environment: 'staging',
//   description: 'ElastiCache Redis for Example App',
//   tags: {
//     ...commonConfig.tags,
//     Project: projectsConfig.exampleApp.name,
//     Environment: 'staging',
//   },
// });
// exampleRedisStack.addDependency(networkingStack);

// ─── Optional: Scheduled Task (uncomment to use) ────────────────────────────
// const exampleCronStack = new ScheduledTaskStack(app, 'ExampleCronStack', {
//   env: env,
//   projectName: projectsConfig.exampleApp.name,
//   environment: productionConfig.environment,
//   vpc: networkingStack.vpc,
//   ecsSecurityGroup: networkingStack.ecsSecurityGroup,
//   ecrRepository: exampleAppSharedStack.ecrRepository,
//   imageTag: productionConfig.environment,
//   command: ['python', 'scripts/my_cron_job.py'],
//   schedule: events.Schedule.rate(cdk.Duration.hours(2)),
//   requiredEnvVars: ['DATABASE_URL'],
//   loggingConfig: productionConfig.logging,
//   description: 'Scheduled task: example cron job (every 2 hours)',
//   tags: {
//     ...commonConfig.tags,
//     Project: projectsConfig.exampleApp.name,
//     Environment: productionConfig.environment,
//   },
// });
// exampleCronStack.addDependency(networkingStack);
// exampleCronStack.addDependency(exampleAppSharedStack);

// ─── Monitoring ─────────────────────────────────────────────────────────────
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env: env,
  monitoringConfig: (commonConfig as any).monitoring,
  ecsServices: [
    {
      projectName: projectsConfig.exampleApp.name,
      environment: stagingConfig.environment,
      clusterName: `${projectsConfig.exampleApp.name}-${stagingConfig.environment}-cluster`,
      serviceName: `${projectsConfig.exampleApp.name}-${stagingConfig.environment}-service`,
      maxCapacity: stagingConfig.autoScaling.maxCapacity,
    },
    {
      projectName: projectsConfig.exampleApp.name,
      environment: productionConfig.environment,
      clusterName: `${projectsConfig.exampleApp.name}-${productionConfig.environment}-cluster`,
      serviceName: `${projectsConfig.exampleApp.name}-${productionConfig.environment}-service`,
      maxCapacity: productionConfig.autoScaling.maxCapacity,
    },
  ],
  codeBuildProjects: [
    { projectName: `${projectsConfig.exampleApp.name}-${stagingConfig.environment}-build` },
    { projectName: `${projectsConfig.exampleApp.name}-${productionConfig.environment}-build` },
  ],
  logGroups: [
    // ECS log groups
    { name: `/ecs/${projectsConfig.exampleApp.name}-${stagingConfig.environment}` },
    { name: `/ecs/${projectsConfig.exampleApp.name}-${productionConfig.environment}` },
    // CodeBuild log groups
    { name: `/aws/codebuild/${projectsConfig.exampleApp.name}-${stagingConfig.environment}` },
    { name: `/aws/codebuild/${projectsConfig.exampleApp.name}-${productionConfig.environment}` },
  ],
  albs: [
    { name: 'staging-shared-alb', alb: stagingAlbStack.alb },
    { name: 'production-shared-alb', alb: productionAlbStack.alb },
  ],
  description: 'Infrastructure monitoring alarms, budget alerts, and cost controls',
  tags: {
    ...commonConfig.tags,
    Stack: 'MonitoringStack',
  },
});
monitoringStack.addDependency(networkingStack);
monitoringStack.addDependency(stagingAlbStack);
monitoringStack.addDependency(productionAlbStack);

app.synth();
