import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface ScheduledTaskStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  ssmEnvironment?: string;
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
  ecrRepository: ecr.IRepository;
  imageTag: string;
  command: string[];
  schedule: events.Schedule;
  requiredEnvVars: string[];
  taskCpu?: number;
  taskMemory?: number;
  loggingConfig: {
    retentionDays: number;
  };
}

export class ScheduledTaskStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ScheduledTaskStackProps) {
    super(scope, id, props);

    const stackName = `${props.projectName}-${props.environment}-cron`;
    const cpu = props.taskCpu ?? 256;
    const memory = props.taskMemory ?? 512;

    // IAM: execution role (pulls image + reads SSM secrets)
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      roleName: `${stackName}-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    const ssmPrefix = `${props.projectName}/${props.ssmEnvironment || props.environment}`;
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/${ssmPrefix}/*`,
        ],
      })
    );

    // IAM: task role (what the running container can do)
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${stackName}-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Log group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/${stackName}`,
      retention: props.loggingConfig.retentionDays,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${stackName}-cluster`,
      vpc: props.vpc,
    });

    // Task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${stackName}-task`,
      cpu: cpu,
      memoryLimitMiB: memory,
      executionRole: executionRole,
      taskRole: taskRole,
    });

    // Build secrets from SSM
    const secrets: { [key: string]: ecs.Secret } = {};
    props.requiredEnvVars.forEach((envVar) => {
      secrets[envVar] = ecs.Secret.fromSsmParameter(
        ssm.StringParameter.fromStringParameterName(
          this,
          envVar,
          `/${ssmPrefix}/${envVar}`
        )
      );
    });

    taskDefinition.addContainer('CronContainer', {
      containerName: `${stackName}-container`,
      image: ecs.ContainerImage.fromEcrRepository(
        props.ecrRepository,
        props.imageTag
      ),
      command: props.command,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'cron',
        logGroup: logGroup,
      }),
      environment: {
        ENVIRONMENT: props.environment,
        PROJECT_NAME: props.projectName,
      },
      secrets: secrets,
    });

    // EventBridge rule -> ECS RunTask
    new events.Rule(this, 'ScheduleRule', {
      ruleName: `${stackName}-schedule`,
      schedule: props.schedule,
      targets: [
        new targets.EcsTask({
          cluster: cluster,
          taskDefinition: taskDefinition,
          subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          securityGroups: [props.ecsSecurityGroup],
        }),
      ],
    });

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
