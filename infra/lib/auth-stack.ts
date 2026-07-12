import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AccountRecovery,
  CfnUserPoolGroup,
  CfnUserPoolUser,
  CfnUserPoolUserToGroupAttachment,
  StringAttribute,
  UserPool,
  UserPoolClient,
} from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { putOutput } from "./ssm";

export interface AuthStackProps extends StackProps {
  readonly config: EnvConfig;
}

interface SeedUser {
  readonly username: string;
  readonly role: "admin" | "parent" | "student";
}

const SEED_USERS: SeedUser[] = [
  { username: "grahem", role: "admin" },
  { username: "kate", role: "parent" },
  { username: "keira", role: "student" },
];

/**
 * AuthStack — Cognito user pool per specs/foundational/auth.md.
 *
 * - Username sign-in, NO email attribute, no auto-verified attributes.
 * - No self-signup. Admin-only user creation; admin-only password reset (AccountRecovery
 *   NONE — there is no forgot-password / email recovery flow).
 * - Custom attribute `custom:role` carries admin | parent | student.
 * - 3 pre-created users (grahem/kate/keira) with temporary passwords and the
 *   NEW_PASSWORD_REQUIRED first-login challenge; welcome emails suppressed
 *   (MessageAction=SUPPRESS — the pool has no email channel anyway).
 * - App client has no secret (public SPA client) and enables USER_SRP + USER_PASSWORD
 *   auth for the Amplify v6 flow.
 *
 * Pool/client IDs are generated and published to SSM — never hardcoded.
 */
export class AuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;

    const removalPolicy =
      config.removalPolicy === "retain" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: `${config.namePrefix}-users`,
      // Username-only sign-in. No email/phone sign-in aliases.
      signInAliases: { username: true, email: false, phone: false, preferredUsername: false },
      signInCaseSensitive: false,
      // No self-signup — only admins create users.
      selfSignUpEnabled: false,
      // No auto-verified attributes; pool is email-less.
      autoVerify: {},
      standardAttributes: {},
      // custom:role carries admin|parent|student|member. custom:tenantId scopes the user to their
      // family (SaaS multi-tenancy); custom:platformAdmin marks a super-admin. NOTE: tenantId +
      // platformAdmin were originally added out-of-band via `add-custom-attributes` on the existing
      // staging + prod pools (CloudFormation can't add custom attributes to a pool it already created).
      // Declared here so the IaC matches reality and any freshly-created pool gets them.
      customAttributes: {
        role: new StringAttribute({ minLen: 1, maxLen: 16, mutable: true }),
        tenantId: new StringAttribute({ mutable: true }),
        platformAdmin: new StringAttribute({ mutable: true }),
        // Binds a student login to its own roster entry (the router pins the student to this id).
        // Added out-of-band via add-custom-attributes on the existing pools (CFN can't add to an
        // existing pool); declared here so IaC matches + a fresh pool gets it. Deploys as a no-op
        // on existing pools (same as tenantId/platformAdmin).
        studentId: new StringAttribute({ mutable: true }),
      },
      // Private 3-person family app — minimal password policy (Grahem's call). Cognito's floor
      // is 6 chars and length can't be disabled; all character-class requirements are off.
      passwordPolicy: {
        minLength: 6,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      // Admin-only recovery: no email/SMS forgot-password flow.
      accountRecovery: AccountRecovery.NONE,
      removalPolicy,
      deletionProtection: config.stage === "prod",
    });

    this.userPoolClient = new UserPoolClient(this, "SpaClient", {
      userPool: this.userPool,
      userPoolClientName: `${config.namePrefix}-spa`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
        adminUserPassword: false,
        custom: false,
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // One Cognito group per role (mirrors custom:role; useful for group-based policies).
    const groups: Record<string, CfnUserPoolGroup> = {};
    for (const role of ["admin", "parent", "student"] as const) {
      groups[role] = new CfnUserPoolGroup(this, `Group-${role}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: role,
        description: `Keira's Journey ${role} role`,
      });
    }

    // Pre-create the 3 users. CloudFormation's AWS::Cognito::UserPoolUser cannot set a
    // password (no TemporaryPassword property — early validation rejects it). Users are
    // created here in FORCE_CHANGE_PASSWORD state; a post-deploy step sets each user's
    // temporary password via `admin-set-user-password --permanent false`, which keeps the
    // NEW_PASSWORD_REQUIRED first-login challenge. Passwords never live in source.
    for (const u of SEED_USERS) {
      const cfnUser = new CfnUserPoolUser(this, `User-${u.username}`, {
        userPoolId: this.userPool.userPoolId,
        username: u.username,
        // SUPPRESS = no welcome message sent (pool is email-less regardless).
        messageAction: "SUPPRESS",
        forceAliasCreation: false,
        userAttributes: [{ name: "custom:role", value: u.role }],
      });

      const attach = new CfnUserPoolUserToGroupAttachment(this, `UserGroup-${u.username}`, {
        userPoolId: this.userPool.userPoolId,
        username: u.username,
        groupName: u.role,
      });
      attach.addDependency(cfnUser);
      attach.addDependency(groups[u.role]);
    }

    putOutput(this, config, "userPoolId", this.userPool.userPoolId, "Cognito user pool id");
    putOutput(
      this,
      config,
      "userPoolClientId",
      this.userPoolClient.userPoolClientId,
      "Cognito SPA app client id",
    );

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
  }
}
