import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

export class AwsCdkStrapiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cmsUploadsSubdomain = "cms-uploads";
    const databaseName = "fgf_cms";

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
    const rdsCredentials = rds.Credentials.fromGeneratedSecret("fgf_cms_admin");
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
      databaseName: databaseName,
      // db.t4g.micro costs $0.016 per hour, which equals $11.52 per 30 days
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rdsCredentials,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    // Allow access to the database from anywhere
    db.connections.allowDefaultPortFromAnyIpv4();

    // Set up an ECR repo to push the Strapi image to
    const ecrRepo = new ecr.Repository(this, "ecr", {
      repositoryName: "fgf-cms",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // Only keep the most recent images
      lifecycleRules: [
        {
          maxImageCount: 20,
        },
      ],
    });

    // Output the repository URL
    new cdk.CfnOutput(this, "ecrRepoUrl", {
      value: ecrRepo.repositoryUri,
    });

    const ssm_ADMIN_JWT_SECRET =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "ADMIN_JWT_SECRET",
        {
          parameterName: "/fgf-cms/production/ADMIN_JWT_SECRET",
        },
      );
    const ssm_API_TOKEN_SALT =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "API_TOKEN_SALT",
        {
          parameterName: "/fgf-cms/production/API_TOKEN_SALT",
        },
      );
    const ssm_APP_KEYS =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "APP_KEYS",
        {
          parameterName: "/fgf-cms/production/APP_KEYS",
        },
      );
    const ssm_JWT_SECRET =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "JWT_SECRET",
        {
          parameterName: "/fgf-cms/production/JWT_SECRET",
        },
      );
    const ssm_TRANSFER_TOKEN_SALT =
      ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        "TRANSFER_TOKEN_SALT",
        {
          parameterName: "/fgf-cms/production/TRANSFER_TOKEN_SALT",
        },
      );

    // For pricing, see:
    // https://aws.amazon.com/fargate/pricing/
    const memoryLimitMiB = 2048; // 2GB
    const cpu = 1024; // 1 vCPU
    const taskDefinition = new ecs.FargateTaskDefinition(this, "taskDef", {
      cpu: cpu,
      memoryLimitMiB: memoryLimitMiB,
      family: "fgf-cms",
    });

    // TODO: This is a hack because ECS can't seem to read the secret from the
    // RDS Credentials object defined earlier, during the database creation.
    const dbSecret = cdk.aws_secretsmanager.Secret.fromSecretAttributes(
      this,
      "dbSecret",
      {
        secretCompleteArn:
          "arn:aws:secretsmanager:us-east-1:536448734625:secret:AwsCdkStrapiStackdbSecret96-OCGl6fpvWvgB-9tB43M",
      },
    );
    const container = taskDefinition.addContainer("container", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepo),
      portMappings: [{ containerPort: 1337 }],
      memoryLimitMiB: memoryLimitMiB,
      logging: ecs.LogDriver.awsLogs({
        logGroup: new logs.LogGroup(this, "LogGroup", {
          retention: logs.RetentionDays.THREE_DAYS,
        }),
        streamPrefix: "fgf-cms",
      }),
      environment: {
        CDN_URL: "https://cms-uploads.farmgirlflowers.com",
        AWS_REGION: "us-east-1",
        AWS_BUCKET: bucket.bucketName,
        DATABASE_CLIENT: "postgres",
        DATABASE_HOST: db.instanceEndpoint.hostname,
        DATABASE_PORT: "5432",
        DATABASE_NAME: databaseName,
        DATABASE_USERNAME: rdsCredentials.username,
        // DATABASE_USERNAME: db.credentials.username,
        // DATABASE_PASSWORD: db.credentials.password,
        DATABASE_SSL: "true",
        DATABASE_SSL_CA: "config/certificates/global-ca-bundle.pem",
        DATABASE_SCHEMA: "public",
      },
      secrets: {
        APP_KEYS: ecs.Secret.fromSsmParameter(ssm_APP_KEYS),
        API_TOKEN_SALT: ecs.Secret.fromSsmParameter(ssm_API_TOKEN_SALT),
        ADMIN_JWT_SECRET: ecs.Secret.fromSsmParameter(ssm_ADMIN_JWT_SECRET),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
        TRANSFER_TOKEN_SALT: ecs.Secret.fromSsmParameter(
          ssm_TRANSFER_TOKEN_SALT,
        ),
        JWT_SECRET: ecs.Secret.fromSsmParameter(ssm_JWT_SECRET),
      },
    });

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
