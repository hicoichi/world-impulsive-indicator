// 地理データと、地形の粒子。海岸線・都市・空港は UI モック（JpScene）のもの。
// 粒子の配置は衝動によらないため、最初の1回だけ作って全画面で使い回す

import type { RegionKey } from '#shared/domain/region'
import { D2R, seeded, TAU, vec, type Vec3 } from './math'

type Polygon = readonly (readonly [number, number])[]

/** 日本の海岸線（経度, 緯度） */
const JAPAN: readonly Polygon[] = [
  [[143.25, 41.93], [144.4, 42.98], [145.6, 43.35], [145.1, 43.65], [145.35, 44.35], [144.25, 44.0], [143.35, 44.35], [141.7, 45.45], [141.65, 44.9], [141.65, 43.95], [141.3, 43.2], [141.0, 43.2], [140.35, 43.35], [139.85, 42.45], [140.1, 41.85], [140.1, 41.42], [140.75, 41.77], [141.15, 41.8], [140.95, 42.32], [141.6, 42.62], [142.75, 42.15]],
  [[130.9, 33.95], [131.4, 34.42], [132.05, 34.9], [132.63, 35.43], [134.2, 35.55], [135.1, 35.75], [136.05, 35.65], [136.3, 36.3], [136.75, 37.1], [137.3, 37.5], [137.0, 36.9], [137.2, 36.75], [138.25, 37.15], [139.05, 37.95], [139.8, 38.9], [139.7, 39.95], [140.2, 40.75], [140.35, 41.25], [140.9, 41.52], [141.45, 41.43], [141.55, 40.5], [142.05, 39.65], [141.65, 38.85], [141.5, 38.3], [140.95, 38.25], [140.95, 37.0], [140.65, 36.6], [140.85, 35.72], [140.4, 35.2], [139.85, 34.9], [139.85, 35.35], [139.65, 35.15], [139.2, 35.25], [138.85, 34.6], [138.85, 35.05], [138.22, 34.6], [137.0, 34.58], [136.85, 34.4], [136.85, 34.25], [135.78, 33.43], [135.1, 34.2], [135.4, 34.65], [135.2, 34.68], [134.7, 34.75], [133.9, 34.55], [133.4, 34.42], [132.45, 34.35], [132.2, 34.15], [131.55, 34.0]],
  [[130.9, 33.92], [131.65, 33.25], [131.95, 32.9], [131.7, 32.55], [131.45, 31.9], [131.35, 31.38], [130.67, 31.0], [130.55, 31.6], [130.2, 31.27], [130.2, 32.0], [130.0, 32.3], [129.85, 32.75], [129.7, 33.15], [130.0, 33.45], [130.4, 33.65]],
  [[134.05, 34.35], [134.6, 34.2], [134.6, 34.05], [134.15, 33.25], [133.55, 33.5], [133.0, 32.72], [132.55, 33.2], [132.0, 33.35], [132.7, 33.85], [133.0, 34.08], [133.3, 33.98]],
  [[138.25, 38.3], [138.55, 38.35], [138.5, 37.85], [138.2, 37.85]],
  [[134.8, 34.6], [135.0, 34.6], [134.85, 34.2]],
  [[129.2, 34.7], [129.5, 34.65], [129.3, 34.1]],
  [[130.45, 30.45], [130.7, 30.4], [130.55, 30.2]],
  [[129.3, 28.5], [129.7, 28.45], [129.4, 28.1]],
  [[127.65, 26.08], [127.9, 26.45], [128.3, 26.87], [128.15, 26.65], [127.7, 26.55]],
]

/** 周辺の大陸・島（暗く描く） */
const CONTEXT: readonly Polygon[] = [
  [[142.0, 59.0], [138.0, 56.5], [137.0, 54.0], [140.5, 53.5], [141.4, 52.5], [140.5, 50.0], [140.3, 48.0], [138.5, 46.5], [136.0, 44.0], [133.0, 42.7], [131.9, 43.1], [130.7, 42.4], [129.8, 41.0], [128.8, 40.0], [127.6, 39.6], [128.4, 38.5], [129.4, 37.0], [129.4, 35.6], [129.0, 35.1], [127.5, 34.6], [126.3, 34.4], [126.5, 35.5], [126.7, 37.0], [126.6, 37.5], [125.2, 37.8], [124.8, 38.5], [125.4, 39.6], [124.4, 39.9], [122.2, 40.4], [121.2, 38.8], [122.0, 39.8], [121.6, 40.9], [120.0, 40.0], [119.0, 39.2], [117.7, 38.9], [118.5, 38.0], [119.0, 37.2], [120.0, 37.6], [122.6, 37.4], [120.4, 36.0], [119.3, 35.0], [120.0, 34.0], [120.8, 32.5], [121.9, 31.6], [121.9, 30.9], [121.4, 30.2], [122.1, 29.9], [121.6, 28.4], [120.3, 27.0], [119.6, 25.8], [118.6, 24.6], [110, 23], [110, 60]],
  [[142.0, 46.0], [143.4, 46.0], [143.0, 47.5], [143.2, 49.0], [144.7, 48.7], [143.2, 50.5], [143.3, 52.5], [143.1, 54.0], [142.7, 54.4], [142.2, 54.2], [141.7, 53.3], [142.2, 51.5], [142.0, 50.0], [142.1, 48.0], [141.8, 46.6]],
  [[121.0, 25.1], [121.9, 25.1], [121.6, 24.0], [120.85, 21.9], [120.15, 22.6], [120.1, 23.5], [120.7, 24.6]],
  [[145.8, 43.6], [147.5, 44.4], [149.5, 45.6], [150.5, 46.2], [150.3, 45.9], [148.5, 44.9], [146.5, 43.8]],
]

export interface Anchor {
  region: RegionKey
  /** 地図に出す英字ラベル（代表都市） */
  label: string
  lat: number
  lon: number
  vec: Vec3
}

/** 地方の代表都市（docs/frontend-plan.md §2.2）。都市の座標は UI モックのもの */
export const ANCHORS: readonly Anchor[] = ([
  ['hokkaido', 'SAPPORO', 43.06, 141.35],
  ['tohoku', 'SENDAI', 38.27, 140.87],
  ['kanto', 'TOKYO', 35.68, 139.76],
  ['chubu', 'NAGOYA', 35.18, 136.91],
  ['kinki', 'OSAKA', 34.69, 135.5],
  ['chugoku', 'HIROSHIMA', 34.39, 132.46],
  ['shikoku', 'TOKUSHIMA', 34.07, 134.55],
  ['kyushu', 'FUKUOKA', 33.59, 130.4],
] as const).map(([region, label, lat, lon]) => ({ region, label, lat, lon, vec: vec(lat, lon) }))

/** 投票の演出の起点。位置情報を使うまでは東京に固定する（docs/frontend-plan.md §2.2） */
export const ORIGIN = vec(35.68, 139.76)

/** 一揆の光の列が通る道筋（UI モック。新潟は道筋の途中の点としてだけ使う） */
const MARCH_COORDS: readonly (readonly (readonly [number, number])[])[] = [
  [[33.59, 130.4], [34.39, 132.46], [34.69, 135.5], [35.18, 136.91], [35.68, 139.76]],
  [[43.06, 141.35], [38.27, 140.87], [35.68, 139.76]],
  [[37.92, 139.04], [35.68, 139.76]],
]

export const MARCH_PATHS: readonly Vec3[][] = MARCH_COORDS.map(path => path.map(([lat, lon]) => vec(lat, lon)))

export interface Airport {
  code: string
  region: RegionKey
  vec: Vec3
}

/** 国外脱出の空港（UI モック）。重みは所属する地方の熱から決める */
export const AIRPORTS: readonly Airport[] = ([
  ['NRT', 'kanto', 35.77, 140.39],
  ['HND', 'kanto', 35.55, 139.78],
  ['KIX', 'kinki', 34.43, 135.23],
  ['NGO', 'chubu', 34.86, 136.81],
  ['FUK', 'kyushu', 33.59, 130.45],
  ['CTS', 'hokkaido', 42.78, 141.69],
] as const).map(([code, region, lat, lon]) => ({ code, region, vec: vec(lat, lon) }))

/** 航路の行き先（UI モック） */
const DESTINATION_COORDS: readonly (readonly [number, number])[] = [
  [21.3, -157.9], [34.0, -118.2], [37.6, -122.4], [49.2, -123.2], [40.6, -73.8], [51.5, -0.5], [49.0, 2.5], [60.3, 25.0], [25.3, 55.4], [1.4, 104.0],
  [13.7, 100.8], [-33.9, 151.2], [37.5, 126.4], [25.1, 121.2], [22.3, 113.9], [14.5, 121.0], [-37.0, 174.8], [13.5, 144.8], [55.9, 37.4], [47.5, -122.3],
]

export const DESTINATIONS: readonly Vec3[] = DESTINATION_COORDS.map(([lat, lon]) => vec(lat, lon))

/** 種子島（国外脱出のレア演出のロケット） */
export const LAUNCH_PAD = vec(30.4, 130.97)

export interface LandParticle {
  v: Vec3
  lat: number
  lon: number
  coast: boolean
  tw: number
  sz: number
  /** 初回に集まってくる前の散らばり */
  sx: number
  sy: number
  /** 粒子ごとの揺らぎの種 */
  d0: number
}

export interface Geography {
  land: LandParticle[]
  context: { v: Vec3, tw: number }[]
  graticule: Vec3[]
}

const LON0 = 112
const LAT1 = 58
const RES = 0.05
const MASK_W = Math.round((156 - LON0) / RES)
const MASK_H = Math.round((LAT1 - 18) / RES)

function makeMask(polys: readonly Polygon[]): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_W
  canvas.height = MASK_H
  const x = canvas.getContext('2d')
  if (!x) throw new Error('Canvas 2D を使えない')
  x.fillStyle = '#fff'
  for (const p of polys) {
    x.beginPath()
    p.forEach(([lon, lat], k) => {
      const px = (lon - LON0) / RES
      const py = (LAT1 - lat) / RES
      if (k) x.lineTo(px, py)
      else x.moveTo(px, py)
    })
    x.closePath()
    x.fill()
  }
  return x.getImageData(0, 0, MASK_W, MASK_H).data
}

function inMask(mask: Uint8ClampedArray, lon: number, lat: number): boolean {
  const px = Math.round((lon - LON0) / RES)
  const py = Math.round((LAT1 - lat) / RES)
  if (px < 0 || py < 0 || px >= MASK_W || py >= MASK_H) return false
  return (mask[(py * MASK_W + px) * 4 + 3] ?? 0) > 100
}

let cached: Geography | null = null

export function geography(): Geography {
  if (cached) return cached
  const japan = makeMask(JAPAN)
  const context = makeMask(CONTEXT)
  const r = seeded(11)
  const land: LandParticle[] = []
  const SP = 0.085
  for (let lat = 24; lat <= 46; lat += SP) {
    for (let lon = 122; lon <= 150; lon += SP / Math.cos(lat * D2R)) {
      const la = lat + (r() - 0.5) * SP * 0.9
      const lo = lon + (r() - 0.5) * SP * 0.9
      if (!inMask(japan, lo, la)) continue
      const e = 0.11
      const coast = !inMask(japan, lo + e, la) || !inMask(japan, lo - e, la) || !inMask(japan, lo, la + e) || !inMask(japan, lo, la - e)
      land.push({
        v: vec(la, lo), lat: la, lon: lo, coast, tw: r() * TAU,
        sz: coast ? 1.25 + r() * 0.6 : 0.6 + r() * 0.8,
        sx: r() * 2 - 1, sy: r() * 2 - 1, d0: r(),
      })
    }
  }
  const ctxParts: Geography['context'] = []
  for (let lat = 20; lat <= 57; lat += 0.2) {
    for (let lon = 112; lon <= 156; lon += 0.2 / Math.cos(lat * D2R)) {
      const la = lat + (r() - 0.5) * 0.15
      const lo = lon + (r() - 0.5) * 0.15
      if (!inMask(context, lo, la) || inMask(japan, lo, la)) continue
      ctxParts.push({ v: vec(la, lo), tw: r() * TAU })
    }
  }
  const graticule: Vec3[] = []
  for (let lat = -10; lat <= 80; lat += 2) for (let lon = 90; lon <= 200; lon += 0.6) graticule.push(vec(lat, lon))
  for (let lon = 90; lon <= 200; lon += 2) for (let lat = -10; lat <= 80; lat += 0.6) graticule.push(vec(lat, lon))
  cached = { land, context: ctxParts, graticule }
  return cached
}
