// World API の代わりにメモリ上で動く WorldSource。
// API の URL を指定せずにビルドしたとき（開発サーバー・E2E）だけ使う。公開用のビルドでは使わない（.github/workflows/ci.yml で確認）。
// 集計の値はモックの仮の数値

import { contributionOf } from '#shared/domain/contribution'
import { IMPULSE_KEYS, type ImpulseKey } from '#shared/domain/impulse'
import { recordOf } from '#shared/domain/record'
import { createRegionRecord, type RegionBucket } from '#shared/domain/region'
import { KANNAMI_IMPULSE_KEYS, type KannamiImpulseKey } from '#shared/domain/target'
import { VOTE_LIMIT } from '#shared/domain/vote'
import type { TargetImpulseState } from '#shared/domain/worldState'
import type { Remaining, WorldSource } from './worldSource'

/** モックの仮の初期値（地方ごとの寄与度） */
const MOCK_REGIONS: Record<ImpulseKey, Partial<Record<RegionBucket, number>>> = {
  ikki: { kanto: 420, kinki: 330, kyushu: 190, chubu: 160, hokkaido: 110, tohoku: 100, chugoku: 120, unknown: 300 },
  exodus: { kanto: 380, kinki: 240, kyushu: 230, chubu: 150, hokkaido: 180, tohoku: 80, unknown: 250 },
  festival: { kinki: 520, kanto: 410, kyushu: 300, tohoku: 260, hokkaido: 220, shikoku: 240, chugoku: 140, unknown: 400 },
}

const MOCK_VOTES: Record<ImpulseKey, number> = { ikki: 12845, exodus: 8392, festival: 31072 }

/** 函南町版の仮の初期値（UI モックの数）。地域は持たない */
const MOCK_KANNAMI: Record<KannamiImpulseKey, TargetImpulseState> = {
  ikki: { votes: 1284, momentum: 420 },
  pack: { votes: 967, momentum: 310 },
  settle: { votes: 3051, momentum: 980 },
}

function worldInitial(key: ImpulseKey): TargetImpulseState {
  const regions = createRegionRecord(bucket => MOCK_REGIONS[key][bucket] ?? 0)
  const momentum = Object.values(regions).reduce((a, b) => a + b, 0)
  return { votes: MOCK_VOTES[key], momentum, regions }
}

function clone(state: TargetImpulseState): TargetImpulseState {
  return state.regions ? { ...state, regions: { ...state.regions } } : { ...state }
}

/** 初期値から動くモック。地域の分布を持つ対象（オリジナル版）だけ、地域に寄与度を足す */
function createMockSource<K extends string>(keys: readonly K[], initial: (key: K) => TargetImpulseState): WorldSource<K> {
  const state = recordOf(keys, initial)
  const mine = recordOf(keys, () => new Set<string>())
  const remaining = (): Remaining<K> => recordOf(keys, key => VOTE_LIMIT - mine[key].size)

  return {
    async fetchState() {
      return recordOf(keys, key => clone(state[key]))
    },
    async fetchRemaining() {
      return remaining()
    },
    async submitVote(impulse, voteId, region) {
      if (mine[impulse].has(voteId)) return { status: 'duplicate', remaining: remaining() }
      if (mine[impulse].size >= VOTE_LIMIT) return { status: 'limit', remaining: remaining() }
      mine[impulse].add(voteId)
      const s = state[impulse]
      const units = contributionOf(mine[impulse].size)
      const next: TargetImpulseState = { votes: s.votes + 1, momentum: s.momentum + units }
      if (s.regions) {
        const bucket = region ?? 'unknown'
        next.regions = { ...s.regions, [bucket]: s.regions[bucket] + units }
      }
      state[impulse] = next
      return { status: 'accepted', remaining: remaining() }
    },
  }
}

export function createMockWorldSource(): WorldSource<ImpulseKey> {
  return createMockSource(IMPULSE_KEYS, worldInitial)
}

export function createMockKannamiSource(): WorldSource<KannamiImpulseKey> {
  return createMockSource(KANNAMI_IMPULSE_KEYS, key => clone(MOCK_KANNAMI[key]))
}
