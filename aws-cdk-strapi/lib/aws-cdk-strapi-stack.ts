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
import * as ses from "aws-cdk-lib/aws-ses";
import * as ssm from "aws-cdk-lib/aws-ssm";
import {
  CloudFrontTarget,
  LoadBalancerTarget,
} from "aws-cdk-lib/aws-route53-targets";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";

export class AwsCdkStrapiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cmsUploadsSubdomain = "cms-uploads";
    const databaseName = "fgf_cms";
    const sesEmailIdentity = ses.EmailIdentity.fromEmailIdentityName(
      this,
      "ses",
      "farmgirlflowers.com",
    );

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

    // Create an ECS Fargate cluster
    const cluster = new ecs.Cluster(this, "cluster", {
      vpc: vpc,
      clusterName: "fgf-cms-cluster",
      containerInsights: true,
    });

    const service = new ecs.FargateService(this, "webApp", {
      serviceName: "web-app",
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true, // Ensure they can pull from the ECR repository
    });
    service.connections.allowFromAnyIpv4(ec2.Port.tcp(1337));

    // Ensure the task role can pull from the ECR repository
    ecrRepo.grantPull(service.taskDefinition.taskRole);

    // Setup load balancer
    const alb = new ApplicationLoadBalancer(this, "ALB", {
      vpc: vpc,
      internetFacing: true,
      loadBalancerName: "fgf-cms-alb",
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
        subnetFilters: [ec2.SubnetFilter.onePerAz()],
      },
    });
    const listener = alb.addListener("Listener", {
      port: 443,
      certificates: [certificate],
      open: true,
    });
    listener.addTargets("CMSService", {
      port: 80,
      targets: [service],
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
    });

    // Setup ECS service with load balancer under the labelary subdomain
    const appSubdomain = "cms." + hostedZone.zoneName;
    new ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: appSubdomain,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
    });

    new cdk.CfnOutput(this, "StrapiURL", {
      description: "The URL for the Strapi CMS admin web app",
      value: "https://" + appSubdomain,
    });

    this.setupIAM({ bucket, sesEmailIdentity });
  }

  /**
   * Set up the IAM permissions
   */
  setupIAM({
    bucket,
    sesEmailIdentity,
  }: {
    bucket: s3.Bucket;
    sesEmailIdentity: ses.IEmailIdentity;
  }) {
    const group = new iam.Group(this, "group", {
      groupName: "strapi-admin",
      path: "/app/",
    });

    const policy = new iam.Policy(this, "policy", {
      policyName: "fgf-cms-web-app-policy",
      statements: [
        new iam.PolicyStatement({
          sid: "AllowS3Access",
          actions: ["s3:*"],
          resources: [bucket.arnForObjects("*")],
        }),
        new iam.PolicyStatement({
          sid: "AllowSESEmailSending",
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        }),
      ],
    });
    policy.attachToGroup(group);

    // Create user for the admin panel backend
    const adminUser = new iam.User(this, "adminUser", {
      userName: "strapi-admin",
      path: "/app/",
    });
    adminUser.addToGroup(group);
  }
}
