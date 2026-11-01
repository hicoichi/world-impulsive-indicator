// 画面の状態（衝動ごとの集計数・演出の強さ・残り枠）と投票の流れ
//
// - 集計状態は一定間隔で取得する（他の人の票の反映。USM Activity 5）
// - 投票は楽観的に反映する：押した瞬間に集計数 +1・残り枠 −1、演出を抽選して返す
// - 通信に失敗しても何も表示しない。裏で送り直し、確定しなかった票は静かに戻す（docs/frontend-plan.md Q-19）

import { computed, reactive, type ComputedRef, type InjectionKey } from 'vue'
import { createImpulseRecord, IMPULSE_KEYS, type ImpulseKey } from '#shared/domain/impulse'
import type { RegionKey } from '#shared/domain/region'
import { VOTE_LIMIT } from '#shared/domain/vote'
import type { WorldState } from '#shared/domain/worldState'
import { createEffectLottery, type EffectChoice } from '../domain/effectLottery'
import { IDLE_VISUAL, visualOf, type ImpulseVisual } from '../domain/visualState'
import type { Remaining, WorldSource } from '../data/worldSource'

/** 集計状態を取り直す間隔 */
export const STATE_POLL_MS = 10_000

/** 自分の残り枠を取り直す間隔。開いたままの間に、自分の票が12時間で外れるのを反映する */
export const REMAINING_POLL_MS = 5 * 60 * 1000

/**
 * 取得した集計が、どれだけ前までの票を含んでいるとみなすか。
 * CloudFront のキャッシュ（5秒）に余裕を持たせた値。これより新しい自分の票は、まだ含まれていないとみなして足す
 */
export const STATE_FRESHNESS_MS = 7_000

/** 送信に失敗したときに送り直すまでの待ち時間 */
export const RETRY_DELAYS_MS = [1_000, 3_000] as const

interface PendingVote {
  id: string
  /** サーバーが受け付けた時刻。送信中は null */
  acceptedAt: number | null
}

export interface ImpulseView {
  /** 表示する集計数。まだ取得できていなければ null */
  count: number | null
  visual: ImpulseVisual
  remaining: number
  limitReached: boolean
}

export interface WorldOptions {
  source: WorldSource
  now?: () => number
  random?: () => number
  createId?: () => string
  sleep?: (ms: number) => Promise<void>
  /** 現在地の地方（位置情報を使わないときは null） */
  region?: () => RegionKey | null
}

/** 票 ID の長さ。同じセッションの直近12時間で重ならなければよいので短くする（サーバーの保存を小さくするため） */
export const VOTE_ID_LENGTH = 8

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** 8文字（48 ビット）の乱数の ID。英数字・ハイフン・アンダースコアだけ（サーバーが受け付ける文字） */
export function createVoteId(): string {
  const bytes = new Uint8Array(VOTE_ID_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ID_CHARS[b % ID_CHARS.length]).join('')
}

export function useWorld(options: WorldOptions) {
  const { source } = options
  const now = options.now ?? Date.now
  const createId = options.createId ?? createVoteId
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)))

  const data = reactive<{ state: WorldState | null, remaining: Remaining, pending: Record<ImpulseKey, PendingVote[]> }>({
    state: null,
    remaining: createImpulseRecord(() => VOTE_LIMIT),
    pending: createImpulseRecord<PendingVote[]>(() => []),
  })
  const lotteries = createImpulseRecord(() => createEffectLottery(options.random))
  const queues = createImpulseRecord<Promise<void>>(() => Promise.resolve())

  const views: Record<ImpulseKey, ComputedRef<ImpulseView>> = createImpulseRecord(key => computed(() => {
    const s = data.state?.[key]
    const remaining = data.remaining[key]
    return {
      count: s ? s.votes + data.pending[key].length : null,
      visual: s ? visualOf(s.momentum, s.regions) : IDLE_VISUAL,
      remaining,
      limitReached: remaining <= 0,
    }
  }))

  function inFlight(key: ImpulseKey): number {
    return data.pending[key].filter(p => p.acceptedAt === null).length
  }

  /** サーバーの残り枠に、まだ送信中の自分の票を差し引いて反映する */
  function applyRemaining(remaining: Remaining): void {
    for (const key of IMPULSE_KEYS) data.remaining[key] = Math.max(0, remaining[key] - inFlight(key))
  }

  function removePending(key: ImpulseKey, id: string): void {
    data.pending[key] = data.pending[key].filter(p => p.id !== id)
  }

  async function refreshState(): Promise<void> {
    const issuedAt = now()
    try {
      const state = await source.fetchState()
      // 取得した集計に含まれているとみなせる自分の票は、足すのをやめる
      for (const key of IMPULSE_KEYS) {
        data.pending[key] = data.pending[key].filter(p => p.acceptedAt === null || p.acceptedAt > issuedAt - STATE_FRESHNESS_MS)
      }
      data.state = state
    }
    catch {
      // 一時的な失敗は、前回の値を表示したまま次の取得を待つ
    }
  }

  async function refreshRemaining(): Promise<void> {
    try {
      const remaining = await source.fetchRemaining()
      if (remaining) applyRemaining(remaining)
    }
    catch {
      // 次の取り直しを待つ
    }
  }

  async function submit(key: ImpulseKey, id: string, region: RegionKey | null): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await source.submitVote(key, id, region)
        if (result.status === 'limit') {
          removePending(key, id)
        }
        else {
          const entry = data.pending[key].find(p => p.id === id)
          if (entry) entry.acceptedAt = now()
        }
        applyRemaining(result.remaining)
        return
      }
      catch {
        const delay = RETRY_DELAYS_MS[attempt]
        if (delay === undefined) {
          // 送り直しても確定しなかった票は、静かに戻す
          removePending(key, id)
          data.remaining[key] = Math.min(VOTE_LIMIT, data.remaining[key] + 1)
          return
        }
        await sleep(delay)
      }
    }
  }

  /**
   * 投票する。受け付けたら演出の抽選結果を返し、上限に達していたら null を返す。
   * 送信は衝動ごとに順番に行う（同じセッションの同時送信で、サーバーの楽観的ロックが競合しないように）
   */
  function vote(key: ImpulseKey): EffectChoice | null {
    if (data.remaining[key] <= 0) return null
    const id = createId()
    // 押した時点の地方で送る（送り直しでも変えない）
    const region = options.region?.() ?? null
    data.remaining[key] -= 1
    data.pending[key].push({ id, acceptedAt: null })
    queues[key] = queues[key].then(() => submit(key, id, region))
    return lotteries[key].draw()
  }

  /** 送信中の票がすべて終わるまで待つ（テスト用） */
  async function settled(): Promise<void> {
    await Promise.all(IMPULSE_KEYS.map(key => queues[key]))
  }

  let stateTimer: ReturnType<typeof setInterval> | undefined
  let remainingTimer: ReturnType<typeof setInterval> | undefined

  function start(): void {
    void refreshState()
    void refreshRemaining()
    stateTimer = setInterval(() => {
      // 裏に回っている間は取りに行かない
      if (typeof document !== 'undefined' && document.hidden) return
      void refreshState()
    }, STATE_POLL_MS)
    remainingTimer = setInterval(() => void refreshRemaining(), REMAINING_POLL_MS)
  }

  function stop(): void {
    clearInterval(stateTimer)
    clearInterval(remainingTimer)
  }

  return { views, vote, start, stop, refreshState, refreshRemaining, settled }
}

export type World = ReturnType<typeof useWorld>

export const WORLD_KEY: InjectionKey<World> = Symbol('world')
