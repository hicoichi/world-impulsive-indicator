// 現在地（緯度経度）を8地方に丸める（USM Activity 6、docs/world-api-design.md Q-06a・b）
//
// 都道府県庁所在地など代表地点のうち最も近いものの地方にする。地方の境界付近では隣の地方になることがあるが、
// 演出の起点と地方の分布に使うだけなので、この精度で足りる。
// 緯度経度はこの関数の中だけで使い、保存も送信もしない。

import type { RegionKey } from '#shared/domain/region'

/** 代表地点から、これ以上離れていたら日本の外とみなす（釜山は福岡から約 200 km） */
export const MAX_DISTANCE_KM = 150

const EARTH_RADIUS_KM = 6371

type Point = readonly [lat: number, lon: number, region: RegionKey]

/** 都道府県庁所在地と、広い地方を補う地点 */
const POINTS: readonly Point[] = [
  [43.06, 141.35, 'hokkaido'], [43.77, 142.37, 'hokkaido'], [42.98, 144.38, 'hokkaido'], [41.77, 140.73, 'hokkaido'],
  [42.92, 143.2, 'hokkaido'], [45.42, 141.67, 'hokkaido'], [44.02, 144.27, 'hokkaido'], [43.33, 145.58, 'hokkaido'],
  [40.82, 140.74, 'tohoku'], [39.7, 141.15, 'tohoku'], [38.27, 140.87, 'tohoku'], [39.72, 140.1, 'tohoku'],
  [38.24, 140.36, 'tohoku'], [37.75, 140.47, 'tohoku'],
  [36.34, 140.45, 'kanto'], [36.57, 139.88, 'kanto'], [36.39, 139.06, 'kanto'], [35.86, 139.65, 'kanto'],
  [35.61, 140.12, 'kanto'], [35.69, 139.69, 'kanto'], [35.45, 139.64, 'kanto'],
  [37.9, 139.02, 'chubu'], [36.7, 137.21, 'chubu'], [36.59, 136.63, 'chubu'], [36.07, 136.22, 'chubu'],
  [35.66, 138.57, 'chubu'], [36.65, 138.18, 'chubu'], [35.39, 136.72, 'chubu'], [34.98, 138.38, 'chubu'], [35.18, 136.91, 'chubu'],
  [34.73, 136.51, 'kinki'], [35.0, 135.87, 'kinki'], [35.02, 135.76, 'kinki'], [34.69, 135.52, 'kinki'],
  [34.69, 135.18, 'kinki'], [34.69, 135.83, 'kinki'], [34.23, 135.17, 'kinki'],
  [35.5, 134.24, 'chugoku'], [35.47, 133.05, 'chugoku'], [34.66, 133.93, 'chugoku'], [34.4, 132.46, 'chugoku'], [34.19, 131.47, 'chugoku'],
  [34.07, 134.56, 'shikoku'], [34.34, 134.04, 'shikoku'], [33.84, 132.77, 'shikoku'], [33.56, 133.53, 'shikoku'],
  [33.61, 130.42, 'kyushu'], [33.25, 130.3, 'kyushu'], [32.74, 129.87, 'kyushu'], [32.79, 130.74, 'kyushu'],
  [33.24, 131.61, 'kyushu'], [31.91, 131.42, 'kyushu'], [31.56, 130.56, 'kyushu'], [28.38, 129.49, 'kyushu'],
  [26.21, 127.68, 'kyushu'], [24.8, 125.28, 'kyushu'], [24.34, 124.16, 'kyushu'],
]

/** 2点間の大円距離（km） */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const dLat = (lat2 - lat1) * r
  const dLon = (lon2 - lon1) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** 現在地の地方。日本の外なら null */
export function regionAt(lat: number, lon: number): RegionKey | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  let best: Point | null = null
  let bestKm = Number.POSITIVE_INFINITY
  for (const p of POINTS) {
    const km = distanceKm(lat, lon, p[0], p[1])
    if (km < bestKm) {
      best = p
      bestKm = km
    }
  }
  return best && bestKm <= MAX_DISTANCE_KM ? best[2] : null
}
