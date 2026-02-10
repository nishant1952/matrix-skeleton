import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface SharedResourcesStackProps extends cdk.StackProps {
  projectName: string;
  ecrRepositoryName: string;
  alarmEmail?: string;
}

export class SharedResourcesStack extends cdk.Stack {
  public readonly ecrRepository: ecr.Repository;
  public readonly artifactBucket: s3.Bucket;
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SharedResourcesStackProps) {
    super(scope, id, props);

    // ECR Repository for Docker images
    this.ecrRepository = new ecr.Repository(this, 'EcrRepository', {
      repositoryName: props.ecrRepositoryName,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Remove untagged images after 5',
          maxImageCount: 5,
          tagStatus: ecr.TagStatus.UNTAGGED,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3 Bucket for pipeline artifacts
    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `${props.projectName}-artifacts-${cdk.Stack.of(this).account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // SNS Topic for CloudWatch Alarms
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${props.projectName}-alarms`,
      displayName: `Alarms for ${props.projectName}`,
    });

    // Add email subscription if provided
    if (props.alarmEmail) {
      this.alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alarmEmail)
      );
    }

    // Export values for use in other stacks
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.ecrRepository.repositoryUri,
      exportName: `${props.projectName}-Shared:EcrRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryArn', {
      value: this.ecrRepository.repositoryArn,
      exportName: `${props.projectName}-Shared:EcrRepositoryArn`,
    });

    new cdk.CfnOutput(this, 'ArtifactBucketName', {
      value: this.artifactBucket.bucketName,
      exportName: `${props.projectName}-Shared:ArtifactBucketName`,
    });

    new cdk.CfnOutput(this, 'ArtifactBucketArn', {
      value: this.artifactBucket.bucketArn,
      exportName: `${props.projectName}-Shared:ArtifactBucketArn`,
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      exportName: `${props.projectName}-Shared:AlarmTopicArn`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Stack', `${props.projectName}-SharedResources`);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
