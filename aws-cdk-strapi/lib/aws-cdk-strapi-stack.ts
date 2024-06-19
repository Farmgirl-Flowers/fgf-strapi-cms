import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

export class AwsCdkStrapiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cmsUploadsSubdomain = "cms-uploads";

    // The code that defines your stack goes here

    const bucket = new s3.Bucket(this, "bucket", {
      bucketName: "fgf-cms-uploads-prod",
    });

    const hostedZone = cdk.aws_route53.HostedZone.fromLookup(
      this,
      "hostedZone",
      {
        domainName: "farmgirlflowers.com",
      },
    );

    const certificate =
      cdk.aws_certificatemanager.Certificate.fromCertificateArn(
        this,
        "certificate",
        "arn:aws:acm:us-east-1:536448734625:certificate/23a6488b-0539-4182-8747-27a05a440206",
      );
    const distribution = new cloudfront.Distribution(this, "cdn", {
      comment: "CDN for Strapi CMS uploads",
      defaultBehavior: { origin: new origins.S3Origin(bucket) },
      domainNames: [`${cmsUploadsSubdomain}.farmgirlflowers.com`],
      certificate,
    });
    new cdk.aws_route53.ARecord(this, "cdnRecord", {
      zone: hostedZone,
      recordName: cmsUploadsSubdomain,
      target: cdk.aws_route53.RecordTarget.fromAlias(
        new CloudFrontTarget(distribution),
      ),
    });

    const vpc = ec2.Vpc.fromLookup(this, "vpc", {
      isDefault: true,
    });

    // Create an RDS database
    const db = new rds.DatabaseInstance(this, "db", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        subnetFilters: [ec2.SubnetFilter.onePerAz()],
      },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceIdentifier: "fgf-cms",
      databaseName: "fgf_cms",
      // db.t4g.micro costs $0.016 per hour, which equals $11.52 per 30 days
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rds.Credentials.fromGeneratedSecret("fgf_cms_admin"),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // Allow access to the database from anywhere
    db.connections.allowDefaultPortFromAnyIpv4();

    this.setupIAM({ bucket });
  }

  /**
   * Set up the IAM permissions
   */
  setupIAM({ bucket }: { bucket: s3.Bucket }) {
    const group = new iam.Group(this, "group", {
      groupName: "strapi-admin",
      path: "/app/",
    });

    // Users in this group have full admin access to the S3 bucket
    group.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:*"],
        resources: [bucket.arnForObjects("*")],
      }),
    );

    // Create user for the admin panel backend
    const adminUser = new iam.User(this, "adminUser", {
      userName: "strapi-admin",
      path: "/app/",
    });
    adminUser.addToGroup(group);
  }
}
