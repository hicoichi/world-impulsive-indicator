import * as cdk from 'aws-cdk-lib/core'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { GithubDeployStack } from '../lib/github-deploy-stack'

function synth(): Template {
  return Template.fromStack(new GithubDeployStack(new cdk.App(), 'TestGithubDeploy'))
}

describe('GithubDeployStack', () => {
  test('OIDC プロバイダーは作らない（姉妹リポジトリが作成済みのものを参照する）', () => {
    synth().resourceCountIs('AWS::IAM::OIDCProvider', 0)
    synth().resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0)
  })

  test('このリポジトリの main ブランチだけがロールを引き受けられる', () => {
    synth().hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Principal: {
            Federated: {
              'Fn::Join': ['', Match.arrayWith([Match.stringLikeRegexp(':oidc-provider/token\\.actions\\.githubusercontent\\.com$')])],
            },
          },
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': 'repo:hicoichi@263043014/world-impulsive-indicator@1441336066:ref:refs/heads/main',
            },
          },
        })],
      },
    })
  })

  test('合成時の検証でエラーにならない（IAM の説明文に使えない文字がない）', () => {
    const app = new cdk.App()
    new GithubDeployStack(app, 'ValidatedGithubDeploy')
    expect(() => app.synth({ validateOnSynthesis: true })).not.toThrow()
  })

  test('許可するのは CDK の初期設定で作られたロールの引き受けだけ', () => {
    const policies = Object.values(synth().findResources('AWS::IAM::Policy')) as {
      Properties: { PolicyDocument: { Statement: { Action: string | string[] }[] } }
    }[]
    const actions = policies.flatMap(policy => policy.Properties.PolicyDocument.Statement).flatMap(s => [s.Action].flat())
    expect(actions).toEqual(['sts:AssumeRole'])
    const resource = JSON.stringify(policies[0]?.Properties.PolicyDocument.Statement[0])
    expect(resource).toContain('role/cdk-hnb659fds-*-')
  })
})
