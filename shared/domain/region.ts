// 位置情報を丸める地域（USM Activity 6、docs/world-api-design.md Q-06a）
//
// 人口の少ない県で個人を推定されないよう、都道府県ではなく8地方に丸める。
// 緯度経度から地方への変換は画面側で行い、サーバーには地方のコードだけを送る（Q-06b）。

export const REGION_KEYS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu'] as const

export type RegionKey = (typeof REGION_KEYS)[number]

/** 位置情報なし・取得できなかった票の集計先 */
export const UNKNOWN_REGION = 'unknown'

export type RegionBucket = RegionKey | typeof UNKNOWN_REGION

export const REGION_BUCKETS: readonly RegionBucket[] = [...REGION_KEYS, UNKNOWN_REGION]

export const REGION_LABELS: Record<RegionKey, string> = {
  hokkaido: '北海道',
  tohoku: '東北',
  kanto: '関東',
  chubu: '中部',
  kinki: '近畿',
  chugoku: '中国',
  shikoku: '四国',
  kyushu: '九州・沖縄',
}

export function isRegionKey(value: unknown): value is RegionKey {
  return typeof value === 'string' && (REGION_KEYS as readonly string[]).includes(value)
}

/** 8地方それぞれに初期値を持つ記録を作る */
export function createRegionKeyRecord<T>(initial: (key: RegionKey) => T): Record<RegionKey, T> {
  return {
    hokkaido: initial('hokkaido'),
    tohoku: initial('tohoku'),
    kanto: initial('kanto'),
    chubu: initial('chubu'),
    kinki: initial('kinki'),
    chugoku: initial('chugoku'),
    shikoku: initial('shikoku'),
    kyushu: initial('kyushu'),
  }
}

/** 各地域（「不明」を含む）に同じ初期値を持つ記録を作る */
export function createRegionRecord<T>(initial: (bucket: RegionBucket) => T): Record<RegionBucket, T> {
  return { ...createRegionKeyRecord(initial), unknown: initial(UNKNOWN_REGION) }
}
