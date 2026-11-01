// World API の公開範囲と流量上限（docs/world-api-design.md Q-13：姉妹アプリの既存 API と同じ値から始める）

import type { Stage } from './stage'

/** 画面（GitHub Pages）のオリジン */
export const PAGES_ORIGIN = 'https://hicoichi.github.io'

/** 開発サーバー（npm run dev）のオリジン。dev ステージだけで許可する */
export const DEV_SERVER_ORIGIN = 'http://localhost:3000'

export function allowedOrigins(stage: Stage): string[] {
  return stage === 'dev' ? [PAGES_ORIGIN, DEV_SERVER_ORIGIN] : [PAGES_ORIGIN]
}

export interface ThrottleLimit {
  /** 1秒あたりの平均リクエスト数 */
  rateLimit: number
  /** 瞬間的に受け付けるリクエスト数 */
  burstLimit: number
}

/** ルートごとの流量上限。最悪の月額はおおむね POST /v1/votes の値で決まる */
export const ROUTE_THROTTLES = {
  'GET /v1/state': { rateLimit: 10, burstLimit: 20 },
  'POST /v1/votes': { rateLimit: 10, burstLimit: 30 },
  'POST /v1/sessions': { rateLimit: 2, burstLimit: 5 },
  'GET /v1/sessions/me': { rateLimit: 10, burstLimit: 20 },
} as const satisfies Record<string, ThrottleLimit>

export type RouteKey = keyof typeof ROUTE_THROTTLES

/** ルート以外（CORS の事前確認など）に適用する既定の上限 */
export const DEFAULT_THROTTLE: ThrottleLimit = { rateLimit: 10, burstLimit: 20 }

/** DynamoDB の1秒あたりの処理量の上限。費用の上限も兼ねる */
export const TABLE_MAX_REQUEST_UNITS = 100

/** CloudFront で集計状態をキャッシュするパスと秒数 */
export const STATE_PATH = '/v1/state'
export const STATE_CACHE_SECONDS = 5

/** 署名用の鍵を置く SSM パラメーター名。SecureString は CloudFormation で作れないため、デプロイ前に手作業で作る */
export function signingKeyParameterName(stage: Stage): string {
  return `/world-impulsive-indicator/${stage}/session-signing-key`
}
