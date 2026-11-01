import { describe, expect, test, vi } from 'vitest'
import { createApiWorldSource, SESSION_TOKEN_HEADER, type TokenStorage } from '../../../app/data/apiWorldSource'

const BASE = 'https://api.example.test/'
const regions = { hokkaido: 0, tohoku: 0, kanto: 1, chubu: 0, kinki: 0, chugoku: 0, shikoku: 0, kyushu: 0, unknown: 0 }
const STATE = { impulses: { ikki: { votes: 1, momentum: 1, regions }, exodus: { votes: 0, momentum: 0, regions }, festival: { votes: 0, momentum: 0, regions } } }
const FULL = { ikki: 10, exodus: 10, festival: 10 }

function memoryStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  return {
    value: initial,
    get() {
      return this.value
    },
    set(token) {
      this.value = token
    },
    clear() {
      this.value = null
    },
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

type Handler = (url: string, init?: RequestInit) => Response

function setup(handler: Handler, token: string | null = null) {
  const calls: { url: string, init?: RequestInit }[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return handler(url, init)
  })
  const storage = memoryStorage(token)
  const source = createApiWorldSource({ baseUrl: BASE, fetch: fetchMock, storage })
  return { source, calls, storage }
}

describe('World API のクライアント', () => {
  test('集計状態をブラウザのキャッシュなしで取得する', async () => {
    const { source, calls } = setup(() => json(200, STATE))
    const state = await source.fetchState()
    expect(state.ikki.votes).toBe(1)
    expect(calls[0]?.url).toBe('https://api.example.test/v1/state')
    expect(calls[0]?.init?.cache).toBe('no-store')
  })

  test('集計の応答が不正なら例外', async () => {
    const { source } = setup(() => json(200, { impulses: {} }))
    await expect(source.fetchState()).rejects.toThrow()
  })

  test('セッションがなければ残り枠は null で、通信しない', async () => {
    const { source, calls } = setup(() => json(200, {}))
    expect(await source.fetchRemaining()).toBeNull()
    expect(calls).toHaveLength(0)
  })

  test('残り枠を取得し、延長したトークンを保存する', async () => {
    const { source, storage, calls } = setup(() => json(200, { token: 'renewed', remaining: { ...FULL, ikki: 7 } }), 'old')
    expect(await source.fetchRemaining()).toEqual({ ...FULL, ikki: 7 })
    expect(new Headers(calls[0]?.init?.headers).get(SESSION_TOKEN_HEADER)).toBe('old')
    expect(storage.value).toBe('renewed')
  })

  test('トークンが無効なら捨てて null', async () => {
    const { source, storage } = setup(() => json(401, { error: 'invalid_session' }), 'bad')
    expect(await source.fetchRemaining()).toBeNull()
    expect(storage.value).toBeNull()
  })

  test('最初の投票でセッションを発行してから送る。地域は送らない', async () => {
    const { source, calls, storage } = setup((url) => {
      if (url.endsWith('/v1/sessions')) return json(201, { token: 't1', remaining: FULL })
      return json(200, { result: 'accepted', token: 't2', remaining: { ...FULL, festival: 9 } })
    })
    expect(await source.submitVote('festival', 'v1', null)).toEqual({ status: 'accepted', remaining: { ...FULL, festival: 9 } })
    expect(calls.map(c => c.url)).toEqual(['https://api.example.test/v1/sessions', 'https://api.example.test/v1/votes'])
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ impulse: 'festival', voteId: 'v1' })
    expect(storage.value).toBe('t2')
  })

  test('上限なら limit', async () => {
    const { source } = setup(() => json(409, { error: 'limit', token: 't', remaining: { ...FULL, ikki: 0 } }), 't')
    expect(await source.submitVote('ikki', 'v1', null)).toEqual({ status: 'limit', remaining: { ...FULL, ikki: 0 } })
  })

  test('再送は duplicate', async () => {
    const { source } = setup(() => json(200, { result: 'duplicate', token: 't', remaining: FULL }), 't')
    expect((await source.submitVote('ikki', 'v1', null)).status).toBe('duplicate')
  })

  test('トークンが無効なら取り直して1回だけ送り直す', async () => {
    let votes = 0
    const { source, storage } = setup((url) => {
      if (url.endsWith('/v1/sessions')) return json(201, { token: 'fresh', remaining: FULL })
      votes++
      return votes === 1 ? json(401, { error: 'invalid_session' }) : json(200, { result: 'accepted', token: 'fresh2', remaining: FULL })
    }, 'expired')
    expect((await source.submitVote('ikki', 'v1', null)).status).toBe('accepted')
    expect(votes).toBe(2)
    expect(storage.value).toBe('fresh2')
  })

  test('サーバーエラーは例外', async () => {
    const { source } = setup(() => json(500, { error: 'internal_error' }), 't')
    await expect(source.submitVote('ikki', 'v1', null)).rejects.toThrow()
  })

  test('地方を使うときは地方のコードだけを付けて送る', async () => {
    const { source, calls } = setup(() => json(200, { result: 'accepted', token: 't', remaining: FULL }), 't')
    await source.submitVote('exodus', 'v1', 'kyushu')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ impulse: 'exodus', voteId: 'v1', region: 'kyushu' })
  })
})
