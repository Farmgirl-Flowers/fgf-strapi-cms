import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";

export class AwsCdkStrapiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    const bucket = new s3.Bucket(this, "bucket", {
      bucketName: "fgf-cms-uploads-prod",
    });

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
