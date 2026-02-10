import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface DnsRecordConfig {
  subdomain: string;
  alb: elbv2.IApplicationLoadBalancer;
}

export interface DnsStackProps extends cdk.StackProps {
  hostedZoneId: string;
  hostedZoneName: string;
  records: DnsRecordConfig[];
}

export class DnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    // Import the existing hosted zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.hostedZoneName,
      }
    );

    // Create A records for each subdomain
    for (const record of props.records) {
      const recordName = `${record.subdomain}.${props.hostedZoneName}`;

      new route53.ARecord(this, `ARecord-${record.subdomain}`, {
        zone: hostedZone,
        recordName: recordName,
        target: route53.RecordTarget.fromAlias(
          new targets.LoadBalancerTarget(record.alb)
        ),
        comment: `Managed by CDK - points to ALB for ${record.subdomain}`,
      });

      new cdk.CfnOutput(this, `DnsRecord-${record.subdomain}`, {
        value: recordName,
        description: `DNS record for ${record.subdomain}`,
      });
    }

    cdk.Tags.of(this).add('Stack', id);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
