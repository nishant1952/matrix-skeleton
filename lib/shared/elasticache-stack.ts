import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface ElastiCacheStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
  projectName: string;
  environment: string;
}

export class ElastiCacheStack extends cdk.Stack {
  public readonly redisEndpoint: string;

  constructor(scope: Construct, id: string, props: ElastiCacheStackProps) {
    super(scope, id, props);

    const stackName = `${props.projectName}-${props.environment}`;

    // Redis-only security group: inbound 6379 from ECS, no outbound needed
    const redisSG = new ec2.SecurityGroup(this, 'RedisSG', {
      vpc: props.vpc,
      description: `Security group for ${stackName} ElastiCache Redis`,
      allowAllOutbound: false,
    });
    redisSG.addIngressRule(
      props.ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Redis access from ECS tasks'
    );

    // Subnet group: private subnets only
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'SubnetGroup', {
      cacheSubnetGroupName: `${stackName}-redis-subnets`,
      description: `Private subnet group for ${stackName} Redis`,
      subnetIds: props.vpc.privateSubnets.map((s) => s.subnetId),
    });

    // Parameter group: allkeys-lru eviction
    const paramGroup = new elasticache.CfnParameterGroup(this, 'ParamGroup', {
      cacheParameterGroupFamily: 'redis7',
      description: `Parameter group for ${stackName} Redis`,
      properties: {
        'maxmemory-policy': 'allkeys-lru',
      },
    });

    // Single-node Redis 7.0 (no replication — suitable for dev/staging)
    const redis = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      clusterName: `${stackName}-redis`,
      cacheNodeType: 'cache.t4g.micro',
      engine: 'redis',
      engineVersion: '7.0',
      numCacheNodes: 1,
      cacheSubnetGroupName: subnetGroup.ref,
      cacheParameterGroupName: paramGroup.ref,
      vpcSecurityGroupIds: [redisSG.securityGroupId],
    });
    redis.addDependency(subnetGroup);
    redis.addDependency(paramGroup);

    // Resolved at deploy time by CloudFormation
    this.redisEndpoint = redis.getAtt('RedisEndpoint.Address').toString();

    new cdk.CfnOutput(this, 'RedisEndpointAddress', {
      value: this.redisEndpoint,
      description: 'ElastiCache Redis endpoint address',
      exportName: `${stackName}:RedisEndpoint`,
    });

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
