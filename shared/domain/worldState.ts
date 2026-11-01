// World API の GET /v1/state の形。画面と Lambda の両方が使う（docs/world-api-design.md §3）

import { createImpulseRecord, IMPULSE_KEYS, type ImpulseKey } from './impulse'
import { createRegionRecord, REGION_BUCKETS, type RegionBucket } from './region'

/** ある衝動の集計状態 */
export interface ImpulseState {
  /** 有効投票数。画面に表示する実数 */
  votes: number
  /** 寄与度の合計。演出の強さに使う */
  momentum: number
  /** 地域ごとの寄与度の合計。地球上の演出の配置に使う */
  regions: Record<RegionBucket, number>
}

export type WorldState = Record<ImpulseKey, ImpulseState>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
}

function parseImpulseState(value: unknown): ImpulseState | null {
  if (!isRecord(value) || !isRecord(value.regions)) return null
  const votes = nonNegative(value.votes)
  const momentum = nonNegative(value.momentum)
  if (votes === null || momentum === null) return null
  const raw = value.regions
  if (!REGION_BUCKETS.every(bucket => nonNegative(raw[bucket]) !== null)) return null
  return { votes, momentum, regions: createRegionRecord(bucket => nonNegative(raw[bucket]) ?? 0) }
}

/** 応答の本文 { impulses } を検証する。形が違えば null */
export function parseWorldState(body: unknown): WorldState | null {
  if (!isRecord(body) || !isRecord(body.impulses)) return null
  const impulses = body.impulses
  const parsed = IMPULSE_KEYS.map(key => parseImpulseState(impulses[key]))
  if (parsed.some(state => state === null)) return null
  return createImpulseRecord(key => parsed[IMPULSE_KEYS.indexOf(key)] ?? emptyImpulseState())
}

export function emptyImpulseState(): ImpulseState {
  return { votes: 0, momentum: 0, regions: createRegionRecord(() => 0) }
}
