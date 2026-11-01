// World API（infra/）に接続する WorldSource（docs/world-api-design.md §3）
//
// - セッションは署名付きの匿名トークンで、localStorage に保存する。最初の投票のときに発行する
// - 上限の判定はサーバーが行い、ここでは結果を返すだけ

import { createImpulseRecord, IMPULSE_KEYS } from '#shared/domain/impulse'
import { parseWorldState } from '#shared/domain/worldState'
import type { Remaining, SubmitResult, WorldSource } from './worldSource'

export const SESSION_TOKEN_HEADER = 'x-session-token'

/** 姉妹アプリと分ける（docs/world-api-design.md §2） */
export const TOKEN_STORAGE_KEY = 'world-impulsive-indicator:session-token'

export interface TokenStorage {
  get(): string | null
  set(token: string): void
  clear(): void
}

/** localStorage が使えない環境（プライベートモードなど）では、メモリ上だけで持つ */
export function createBrowserTokenStorage(): TokenStorage {
  let memory: string | null = null
  return {
    get() {
      try {
        return globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY) ?? memory
      }
      catch {
        return memory
      }
    },
    set(token) {
      memory = token
      try {
        globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, token)
      }
      catch {
        // 保存できなくても、メモリ上のトークンで続けられる
      }
    },
    clear() {
      memory = null
      try {
        globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY)
      }
      catch {
        // 消せなくても、次に 401 が返れば取り直す
      }
    },
  }
}

export interface ApiWorldSourceOptions {
  /** CloudFront の URL（例：https://xxxx.cloudfront.net） */
  baseUrl: string
  fetch?: typeof fetch
  storage?: TokenStorage
}

function toRemaining(value: unknown): Remaining | null {
  if (typeof value !== 'object' || value === null) return null
  const record: Record<string, unknown> = { ...value }
  if (!IMPULSE_KEYS.every(key => typeof record[key] === 'number')) return null
  return createImpulseRecord((key) => {
    const n = record[key]
    return typeof n === 'number' ? Math.max(0, n) : 0
  })
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json()
    return typeof value === 'object' && value !== null ? { ...value } : {}
  }
  catch {
    return {}
  }
}

export function createApiWorldSource(options: ApiWorldSourceOptions): WorldSource {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const storage = options.storage ?? createBrowserTokenStorage()

  function applyToken(value: unknown): void {
    if (typeof value === 'string' && value) storage.set(value)
  }

  async function createSession(): Promise<string> {
    const response = await doFetch(`${baseUrl}/v1/sessions`, { method: 'POST' })
    if (!response.ok) throw new Error(`セッションを発行できなかった（HTTP ${response.status}）`)
    const body = await readJson(response)
    if (typeof body.token !== 'string' || !body.token) throw new Error('セッションの応答が不正')
    storage.set(body.token)
    return body.token
  }

  function postVote(token: string, impulse: string, voteId: string): Promise<Response> {
    return doFetch(`${baseUrl}/v1/votes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SESSION_TOKEN_HEADER]: token },
      body: JSON.stringify({ impulse, voteId }),
    })
  }

  return {
    async fetchState() {
      // ブラウザのキャッシュは使わない（CloudFront の数秒のキャッシュだけにする）
      const response = await doFetch(`${baseUrl}/v1/state`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`集計を取得できなかった（HTTP ${response.status}）`)
      const state = parseWorldState(await readJson(response))
      if (!state) throw new Error('集計の応答が不正')
      return state
    },

    async fetchRemaining() {
      const token = storage.get()
      if (!token) return null
      const response = await doFetch(`${baseUrl}/v1/sessions/me`, { headers: { [SESSION_TOKEN_HEADER]: token } })
      if (response.status === 401) {
        storage.clear()
        return null
      }
      if (!response.ok) throw new Error(`残り枠を取得できなかった（HTTP ${response.status}）`)
      const body = await readJson(response)
      applyToken(body.token)
      return toRemaining(body.remaining)
    },

    async submitVote(impulse, voteId): Promise<SubmitResult> {
      let token = storage.get() ?? await createSession()
      let response = await postVote(token, impulse, voteId)
      if (response.status === 401) {
        // 期限切れ・鍵の入れ替えなどで無効になったトークンは取り直して1回だけ送り直す
        storage.clear()
        token = await createSession()
        response = await postVote(token, impulse, voteId)
      }
      const body = await readJson(response)
      applyToken(body.token)
      const remaining = toRemaining(body.remaining)
      if (response.status === 409 && remaining) return { status: 'limit', remaining }
      if (!response.ok || !remaining) throw new Error(`投票できなかった（HTTP ${response.status}）`)
      return { status: body.result === 'duplicate' ? 'duplicate' : 'accepted', remaining }
    },
  }
}
