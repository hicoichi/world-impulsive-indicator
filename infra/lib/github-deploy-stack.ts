// GitHub Actions から CDK をデプロイするための IAM ロール。
// アカウントに1つだけ作る（ステージごとには作らない）。初回だけ手元からデプロイする
//
// GitHub の OIDC プロバイダーは URL ごとにアカウントに1つしか作れず、姉妹リポジトリ
// impulsive-momentum-indicator の ImpulsiveMomentumGithubDeploy スタックが作成済み。
// ここでは作らずに ARN で参照し、このリポジトリ専用のロールだけを作る。
// そのため、姉妹リポジトリの GithubDeploy スタックを削除すると、このロールも使えなくなる。

import * as iam from 'aws-cdk-lib/aws-iam'
import * as cdk from 'aws-cdk-lib/core'
import type { Construct } from 'constructs'

/** デプロイを許可するリポジトリとブランチ */
export const GITHUB_REPOSITORY = 'hicoichi/world-impulsive-indicator'
export const DEPLOY_BRANCH = 'main'

/**
 * GitHub の ID トークンの sub に入るリポジトリの識別子。
 * このリポジトリは変更されない ID 付きの形式（所有者名@所有者 ID/リポジトリ名@リポジトリ ID）を使う。
 * 名前を変えたり、同じ名前で作り直したりしても、別のリポジトリが一致することはない。
 * 確認方法：gh api repos/hicoichi/world-impulsive-indicator/actions/oidc/customization/sub
 */
export const GITHUB_SUBJECT_PREFIX = 'repo:hicoichi@263043014/world-impulsive-indicator@1441336066'

/** 姉妹リポジトリが作成済みの OIDC プロバイダー（ARN の末尾は URL のホスト名） */
const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com'

export class GithubDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const providerArn = `arn:${cdk.Aws.PARTITION}:iam::${cdk.Aws.ACCOUNT_ID}:oidc-provider/${GITHUB_OIDC_HOST}`

    const role = new iam.Role(this, 'DeployRole', {
      // IAM の説明文は ASCII などに限られるため英語で書く
      description: `Deploy CDK stacks from ${GITHUB_REPOSITORY} (${DEPLOY_BRANCH} branch) via GitHub Actions`,
      maxSessionDuration: cdk.Duration.hours(1),
      // main ブランチで動いたワークフローだけが引き受けられる
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: `${GITHUB_SUBJECT_PREFIX}:ref:refs/heads/${DEPLOY_BRANCH}`,
        },
      }),
    })

    // CDK の初期設定（bootstrap）で作られたロールだけを引き受けられるようにする。
    // 実際のリソースの変更は、それらのロールを通じて CloudFormation が行う
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:${cdk.Aws.PARTITION}:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-hnb659fds-*-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`],
    }))

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      description: 'GitHub の変数 AWS_DEPLOY_ROLE_ARN に設定する',
      value: role.roleArn,
    })
  }
}
