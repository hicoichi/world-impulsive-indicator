// 集計状態（World API の GET /v1/state）から、地球の持続的な演出の強さを決める。
// 表示する数値（有効投票数）はここを通さない。演出の迫力だけを非線形に決める（USM §5「データの信頼性」）

import { createRegionKeyRecord, REGION_KEYS, UNKNOWN_REGION, type RegionBucket, type RegionKey } from '#shared/domain/region'

/** 「にぎわい」が最大になる寄与度の合計。これを超えても演出は増えない */
export const FULL_ACTIVITY_MOMENTUM = 3000

/** 票がない地方にも残す、ほのかな熱（地球の基本演出） */
export const BASE_HEAT = 0.15

/** 地図にラベルを出す地方の数（docs/frontend-plan.md Q-18） */
export const LABELED_REGIONS = 5

export interface ImpulseVisual {
  /** にぎわい（0〜1）。群衆の人数・飛行機や花火の頻度などに掛ける */
  activity: number
  /** 地方ごとの熱（0〜1） */
  heat: Record<RegionKey, number>
  /** ラベルを出す地方（寄与度の大きい順、票のある地方だけ） */
  labeled: RegionKey[]
}

/**
 * にぎわい。最初の数票でもはっきり変わり、票が増えるほど伸びが緩やかになるよう対数で対応させる
 */
export function activityOf(momentum: number): number {
  if (!(momentum > 0)) return 0
  return Math.min(1, Math.log1p(momentum) / Math.log1p(FULL_ACTIVITY_MOMENTUM))
}

export function visualOf(momentum: number, regions: Record<RegionBucket, number>): ImpulseVisual {
  const activity = activityOf(momentum)
  // 地域なしの票は、全国に均等に配る
  const spread = Math.max(0, regions[UNKNOWN_REGION]) / REGION_KEYS.length
  const share = (key: RegionKey) => Math.max(0, regions[key]) + spread
  const max = Math.max(...REGION_KEYS.map(share))
  const strength = 0.35 + 0.65 * activity
  const heat = createRegionKeyRecord(key =>
    max > 0 ? BASE_HEAT + (1 - BASE_HEAT) * (share(key) / max) * strength : BASE_HEAT)
  const labeled = REGION_KEYS
    .filter(key => regions[key] > 0)
    .sort((a, b) => regions[b] - regions[a])
    .slice(0, LABELED_REGIONS)
  return { activity, heat, labeled }
}

/** まだ取得できていないときの見た目（地球の基本演出だけ） */
export const IDLE_VISUAL: ImpulseVisual = {
  activity: 0,
  heat: createRegionKeyRecord(() => BASE_HEAT),
  labeled: [],
}
