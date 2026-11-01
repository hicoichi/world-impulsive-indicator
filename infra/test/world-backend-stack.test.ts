import * as cdk from 'aws-cdk-lib/core'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { DEFAULT_STAGE, resolveStage, type Stage } from '../lib/stage'
import { WorldBackendStack } from '../lib/world-backend-stack'

/** CloudFront のマネージドキャッシュポリシー「CachingDisabled」の ID */
const CACHING_DISABLED_POLICY_ID = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'

function synth(stage: Stage): Template {
  // テストでは Lambda のバンドルを省く
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } })
  const stack = new WorldBackendStack(app, `Test-${stage}`, { stage })
  return Template.fromStack(stack)
}

describe('resolveStage', () => {
  test('未指定なら dev', () => {
    expect(resolveStage(undefined)).toBe(DEFAULT_STAGE)
    expect(DEFAULT_STAGE).toBe('dev')
  })

  test('dev と prod を受け付ける', () => {
    expect(resolveStage('dev')).toBe('dev')
    expect(resolveStage('prod')).toBe('prod')
  })

  test('不正な値はエラーにする', () => {
    expect(() => resolveStage('production')).toThrow('stage は dev / prod')
  })
})

describe('DynamoDB', () => {
  test('オンデマンドで読み書きとも処理量の上限があり、TTL が有効', () => {
    synth('dev').hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      BillingMode: 'PAY_PER_REQUEST',
      WriteOnDemandThroughputSettings: { MaxWriteRequestUnits: 100 },
      Replicas: [Match.objectLike({ ReadOnDemandThroughputSettings: { MaxReadRequestUnits: 100 } })],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    })
  })

  test('dev は削除できる', () => {
    synth('dev').hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Delete' })
  })

  test('prod は残し、削除保護とポイントインタイムリカバリを有効にする', () => {
    const template = synth('prod')
    template.hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Retain' })
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      Replicas: [Match.objectLike({
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      })],
    })
  })
})

describe('Lambda', () => {
  test('Node.js 24・arm64 で、テーブル名と World 用の鍵のパラメーター名を受け取る', () => {
    synth('dev').hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Environment: {
        Variables: Match.objectLike({
          TABLE_NAME: Match.anyValue(),
          SIGNING_KEY_PARAMETER: '/world-impulsive-indicator/dev/session-signing-key',
        }),
      },
    })
  })

  test('DynamoDB には Query・PutItem・UpdateItem だけを許可する', () => {
    const policies = Object.values(synth('dev').findResources('AWS::IAM::Policy')) as {
      Properties: { PolicyDocument: { Statement: { Action: string | string[] }[] } }
    }[]
    const dynamoActions = policies
      .flatMap(policy => policy.Properties.PolicyDocument.Statement)
      .flatMap(statement => [statement.Action].flat())
      .filter(action => action.startsWith('dynamodb:'))
      .sort()
    expect(dynamoActions).toEqual(['dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem'])
  })

  test('ログの保持期間は dev 1週間、prod 1か月', () => {
    synth('dev').hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 })
    synth('prod').hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 })
  })
})

describe('HTTP API', () => {
  test('/v1 の4つのルートがある', () => {
    const routes = synth('dev').findResources('AWS::ApiGatewayV2::Route')
    const keys = Object.values(routes).map(route => (route as { Properties: { RouteKey: string } }).Properties.RouteKey).sort()
    expect(keys).toEqual(['GET /v1/sessions/me', 'GET /v1/state', 'POST /v1/sessions', 'POST /v1/votes'])
  })

  test('ルートごとに流量上限を設定する', () => {
    synth('dev').hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
      RouteSettings: {
        'GET /v1/state': { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
        'POST /v1/votes': { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 30 },
        'POST /v1/sessions': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
        'GET /v1/sessions/me': { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
      },
    })
  })

  test('ステージはルートの作成後に作る', () => {
    const template = synth('dev')
    const stage = Object.values(template.findResources('AWS::ApiGatewayV2::Stage'))[0] as { DependsOn: string[] }
    const routeIds = Object.keys(template.findResources('AWS::ApiGatewayV2::Route'))
    expect(stage.DependsOn).toEqual(expect.arrayContaining(routeIds))
  })

  test('CORS：prod は GitHub Pages だけ、dev は開発サーバーも許可する', () => {
    synth('prod').hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://hicoichi.github.io'],
        AllowHeaders: ['content-type', 'x-session-token'],
      }),
    })
    synth('dev').hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({ AllowOrigins: ['https://hicoichi.github.io', 'http://localhost:3000'] }),
    })
  })
})

describe('CloudFront', () => {
  test('/v1/state だけを5秒キャッシュし、Origin ごとに分ける', () => {
    const template = synth('dev')
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        DefaultTTL: 5,
        MaxTTL: 5,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
          HeadersConfig: { HeaderBehavior: 'whitelist', Headers: ['Origin'] },
          CookiesConfig: { CookieBehavior: 'none' },
          QueryStringsConfig: { QueryStringBehavior: 'none' },
        }),
      }),
    })
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        PriceClass: 'PriceClass_200',
        CacheBehaviors: [Match.objectLike({ PathPattern: '/v1/state', AllowedMethods: ['GET', 'HEAD', 'OPTIONS'] })],
      }),
    })
  })

  test('セッションを扱う既定の振る舞いはキャッシュしない', () => {
    synth('dev').hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          CachePolicyId: CACHING_DISABLED_POLICY_ID,
          ViewerProtocolPolicy: 'https-only',
        }),
      }),
    })
  })
})

describe('姉妹アプリとの分離', () => {
  test('予算アラートは作らない（アカウント全体のものが姉妹リポジトリにある）', () => {
    synth('dev').resourceCountIs('AWS::Budgets::Budget', 0)
  })
})
