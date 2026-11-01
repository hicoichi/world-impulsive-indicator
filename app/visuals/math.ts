// 描画で使う数学の小道具。値と式は UI モック（JpScene）のもの

export type Vec3 = [number, number, number]

export const D2R = Math.PI / 180
export const TAU = Math.PI * 2

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a)
export function pick<T>(list: readonly T[]): T {
  const item = list[Math.floor(Math.random() * list.length)]
  if (item === undefined) throw new Error('空の配列からは選べない')
  return item
}
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)
export function easeBack(k: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
}

/** 再現性のある乱数（地形の粒子の配置を毎回同じにするため） */
export function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 緯度経度を単位球上の点にする */
export function vec(lat: number, lon: number): Vec3 {
  const la = lat * D2R
  const lo = lon * D2R
  const c = Math.cos(la)
  return [c * Math.sin(lo), Math.sin(la), c * Math.cos(lo)]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** 大円上の補間。om は2点の間の角、so はその sin */
export function slerpV(a: Vec3, b: Vec3, om: number, so: number, u: number): Vec3 {
  if (so < 1e-5) return a
  const s1 = Math.sin((1 - u) * om) / so
  const s2 = Math.sin(u * om) / so
  return [a[0] * s1 + b[0] * s2, a[1] * s1 + b[1] * s2, a[2] * s1 + b[2] * s2]
}

export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1))
}

export type RGB = [number, number, number]

export function hexRGB(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
