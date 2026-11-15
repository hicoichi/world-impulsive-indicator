// World API のルーティングと入出力の検証。AWS には依存せず、テストから直接呼べる
//
// | ルート                 | 認証               | 内容                                          |
// |------------------------|--------------------|-----------------------------------------------|
// | GET /v1/state          | なし               | 衝動ごとの集計状態（CloudFront で数秒キャッシュ） |
// | POST /v1/sessions      | なし               | 匿名セッションの発行                           |
// | GET /v1/sessions/me    | X-Session-Token    | 残り投票枠。トークンを延長して返す              |
// | POST /v1/votes         | X-Session-Token    | 投票（地域は任意）。トークンを延長して返す       |
//
// 評価対象（target）は GET ではクエリ `?target=`、投票では本文の `target` で受け取る。
// 省略時はオリジナル版（world）で、対象を足す前と同じ応答になる（docs/world-api-design.md §8.4）。

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { isRegionKey, UNKNOWN_REGION, type RegionBucket } from '../../../shared/domain/region'
import { createTargetImpulseRecord, DEFAULT_TARGET, isImpulseOf, isTargetKey, TARGETS, type TargetKey } from '../../../shared/domain/target'
import { VOTE_LIMIT } from '../../../shared/domain/vote'
import { createSessionId, renewSession, verifySession } from './session-token'
import { castVote, getRemaining, getState, type VoteServiceDeps } from './vote-service'

export const SESSION_TOKEN_HEADER = 'x-session-token'

/** 集計状態をキャッシュしてよい秒数（ブラウザと CloudFront） */
export const STATE_MAX_AGE_SECONDS = 5

/** リクエスト本文の上限 */
const MAX_BODY_BYTES = 1024

/** 票 ID：英数字・ハイフン・アンダースコア、64 文字まで */
const VOTE_ID_PATTERN = /^[\w-]{1,64}$/

export interface ApiDeps extends VoteServiceDeps {
  /** 署名用の鍵。必要になったときだけ取得する */
  signingKey: () => Promise<string>
}

type Response = APIGatewayProxyStructuredResultV2

interface VoteBody {
  target: TargetKey
  impulse: string
  voteId: string
  /** 位置情報を使わない対象では null */
  region: RegionBucket | null
}

function json(statusCode: number, body: unknown, cacheControl = 'no-store'): Response {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': cacheControl },
    body: JSON.stringify(body),
  }
}

function error(statusCode: number, code: string): Response {
  return json(statusCode, { error: code })
}

/** 対象は省略なら既定（world）。知らない対象は undefined（拒否） */
function parseTarget(value: unknown): TargetKey | undefined {
  if (value === undefined || value === null) return DEFAULT_TARGET
  return isTargetKey(value) ? value : undefined
}

/**
 * 地域は省略（または null）なら「不明」に集計する。知らないコードは拒否する（undefined）。
 * 位置情報を使わない対象では地域を受け取らない（null）。値が送られてきたら拒否する
 */
function parseRegion(target: TargetKey, value: unknown): RegionBucket | null | undefined {
  const absent = value === undefined || value === null
  if (!TARGETS[target].usesRegion) return absent ? null : undefined
  if (absent) return UNKNOWN_REGION
  return isRegionKey(value) ? value : undefined
}

function targetOfQuery(event: APIGatewayProxyEventV2): TargetKey | undefined {
  return parseTarget(event.queryStringParameters?.target)
}

function parseVoteBody(event: APIGatewayProxyEventV2): VoteBody | null {
  if (!event.body) return null
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { target, impulse, voteId, region } = value as Record<string, unknown>
    const parsedTarget = parseTarget(target)
    if (!parsedTarget) return null
    if (!isImpulseOf(parsedTarget, impulse) || typeof voteId !== 'string' || !VOTE_ID_PATTERN.test(voteId)) return null
    const parsedRegion = parseRegion(parsedTarget, region)
    if (parsedRegion === undefined) return null
    return { target: parsedTarget, impulse, voteId, region: parsedRegion }
  }
  catch {
    return null
  }
}

async function authenticate(event: APIGatewayProxyEventV2, deps: ApiDeps): Promise<{ sid: string, key: string } | null> {
  const key = await deps.signingKey()
  const claims = verifySession(event.headers[SESSION_TOKEN_HEADER], key, deps.now())
  return claims ? { sid: claims.sid, key } : null
}

async function route(event: APIGatewayProxyEventV2, deps: ApiDeps): Promise<Response> {
  switch (event.routeKey) {
    case 'GET /v1/state': {
      const target = targetOfQuery(event)
      if (!target) return error(400, 'invalid_request')
      const impulses = await getState(deps, target)
      return json(200, { target, impulses }, `public, max-age=${STATE_MAX_AGE_SECONDS}`)
    }
    case 'POST /v1/sessions': {
      const target = targetOfQuery(event)
      if (!target) return error(400, 'invalid_request')
      const key = await deps.signingKey()
      const sid = createSessionId()
      // 新しいセッションには記録がないため、残り枠は読まずに上限いっぱいで返す
      const remaining = createTargetImpulseRecord(target, () => VOTE_LIMIT)
      return json(201, { token: renewSession(sid, deps.now(), key), remaining })
    }
    case 'GET /v1/sessions/me': {
      const target = targetOfQuery(event)
      if (!target) return error(400, 'invalid_request')
      const session = await authenticate(event, deps)
      if (!session) return error(401, 'invalid_session')
      const remaining = await getRemaining(deps, session.sid, target)
      return json(200, { token: renewSession(session.sid, deps.now(), session.key), remaining })
    }
    case 'POST /v1/votes': {
      const session = await authenticate(event, deps)
      if (!session) return error(401, 'invalid_session')
      const body = parseVoteBody(event)
      if (!body) return error(400, 'invalid_request')
      const result = await castVote(deps, session.sid, body.target, body.impulse, body.voteId, body.region)
      const token = renewSession(session.sid, deps.now(), session.key)
      if (result.status === 'limit') {
        return json(409, { error: 'limit', token, remaining: result.remaining })
      }
      return json(200, { result: result.status, token, remaining: result.remaining })
    }
    default:
      return error(404, 'not_found')
  }
}

export function createApiHandler(deps: ApiDeps) {
  return async (event: APIGatewayProxyEventV2): Promise<Response> => {
    try {
      return await route(event, deps)
    }
    catch (cause) {
      // トークン・リクエスト本文（地域を含む）はログに残さない
      console.error('API の処理に失敗した', { routeKey: event.routeKey, error: cause instanceof Error ? cause.message : String(cause) })
      return error(500, 'internal_error')
    }
  }
}
