#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core'
import { GithubDeployStack } from '../lib/github-deploy-stack'
import { resolveStage } from '../lib/stage'
import { WorldBackendStack } from '../lib/world-backend-stack'

const app = new cdk.App()
const stage = resolveStage(app.node.tryGetContext('stage'))

// すべてのリソースに付けるタグ
cdk.Tags.of(app).add('Project', 'world-impulsive-indicator')
cdk.Tags.of(app).add('Stage', stage)

// アカウントとリージョンはコードに書かず、cdk コマンド実行時の AWS 設定から受け取る
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

// 予算アラートはアカウント全体が対象で、姉妹リポジトリのスタックが作成済みのため、ここでは作らない
new WorldBackendStack(app, `ImpulsiveWorldBackend-${stage}`, { stage, env })

// ステージに関係なくアカウントに1つ。GitHub Actions からのデプロイに使う
new GithubDeployStack(app, 'ImpulsiveWorldGithubDeploy', { env })
