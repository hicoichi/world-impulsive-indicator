// World API の代わりにメモリ上で動く WorldSource。
// API の URL を指定せずにビルドしたとき（開発サーバー・E2E）だけ使う。公開用のビルドでは使わない（.github/workflows/pages.yml で確認）。
// 集計の値はモックの仮の数値

import { contributionOf } from '#shared/domain/contribution'
import { createImpulseRecord, type ImpulseKey } from '#shared/domain/impulse'
import { createRegionRecord, type RegionBucket } from '#shared/domain/region'
import { VOTE_LIMIT } from '#shared/domain/vote'
import type { ImpulseState, WorldState } from '#shared/domain/worldState'
import type { Remaining, WorldSource } from './worldSource'

/** モックの仮の初期値（地方ごとの寄与度） */
const MOCK_REGIONS: Record<ImpulseKey, Partial<Record<RegionBucket, number>>> = {
  ikki: { kanto: 420, kinki: 330, kyushu: 190, chubu: 160, hokkaido: 110, tohoku: 100, chugoku: 120, unknown: 300 },
  exodus: { kanto: 380, kinki: 240, kyushu: 230, chubu: 150, hokkaido: 180, tohoku: 80, unknown: 250 },
  festival: { kinki: 520, kanto: 410, kyushu: 300, tohoku: 260, hokkaido: 220, shikoku: 240, chugoku: 140, unknown: 400 },
}

const MOCK_VOTES: Record<ImpulseKey, number> = { ikki: 12845, exodus: 8392, festival: 31072 }

function initialState(key: ImpulseKey): ImpulseState {
  const regions = createRegionRecord(bucket => MOCK_REGIONS[key][bucket] ?? 0)
  const momentum = Object.values(regions).reduce((a, b) => a + b, 0)
  return { votes: MOCK_VOTES[key], momentum, regions }
}

function cloneState(state: WorldState): WorldState {
  return createImpulseRecord(key => ({ ...state[key], regions: { ...state[key].regions } }))
}

export function createMockWorldSource(): WorldSource {
  const state = createImpulseRecord(initialState)
  const mine = createImpulseRecord(() => new Set<string>())
  const remaining = (): Remaining => createImpulseRecord(key => VOTE_LIMIT - mine[key].size)

  return {
    async fetchState() {
      return cloneState(state)
    },
    async fetchRemaining() {
      return remaining()
    },
    async submitVote(impulse, voteId) {
      if (mine[impulse].has(voteId)) return { status: 'duplicate', remaining: remaining() }
      if (mine[impulse].size >= VOTE_LIMIT) return { status: 'limit', remaining: remaining() }
      mine[impulse].add(voteId)
      const s = state[impulse]
      const units = contributionOf(mine[impulse].size)
      state[impulse] = { votes: s.votes + 1, momentum: s.momentum + units, regions: { ...s.regions, unknown: s.regions.unknown + units } }
      return { status: 'accepted', remaining: remaining() }
    },
  }
}
