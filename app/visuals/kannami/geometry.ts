// 函南町版の舞台：正方形の台座の上の地形と名所、森、富士山・海・伊豆の山並みの遠景。
// 形・値・配置は UI モック（docs/函南町_スマホ-html/KnScene.dc.html）のもの。
//
// 衝動によらない形なので、最初に1回だけ作り、全画面で使い回す（モックは画面ごとに作っていた）。
// 座標：x は西→東、z は南→北、y は高さ。台座は x・z が −1〜1

import { clamp, seeded, TAU, type RGB, type Vec3 } from '../math'

/** ホログラムの面：半透明の塗り＋光る輪郭 */
export interface Face {
  p: Vec3[]
  /** 外向きの法線（裏向きの面は描かない） */
  n: Vec3
  ctr: Vec3
  rgb: RGB
  a: number
  edge: RGB
  ea: number
  glow: number
  /** 地形・台座の面（衝動の色に強く染める） */
  tier: number
}

export interface Line {
  a: Vec3
  b: Vec3
  col: RGB
  a0: number
  /** 向き。カメラから裏になる線は描かない */
  n: Vec3 | null
  w: number
  glow: number
}

interface FaceOptions {
  a?: number
  edge?: RGB
  ea?: number
  glow?: number
  tier?: number
  bottom?: boolean
}

interface LineOptions {
  a?: number
  n?: Vec3
  w?: number
  glow?: number
}

interface BoxColors {
  top?: RGB
  front?: RGB
  back?: RGB
  right?: RGB
  left?: RGB
}

/** 位置・回転・大きさを持つ座標の変換 */
export type Transform = (x: number, y: number, z: number) => Vec3

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const crs = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const nrm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const cross3 = crs
export const sub3 = sub

function avg(pts: readonly Vec3[]): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  for (const p of pts) {
    x += p[0]
    y += p[1]
    z += p[2]
  }
  return [x / pts.length, y / pts.length, z / pts.length]
}

/** 光の向き（面の明るさ） */
const LIGHT = nrm([-0.45, 0.85, -0.35])

export function transform(ox: number, oy: number, oz: number, rot = 0, scale = 1): Transform {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return (x, y, z) => [ox + (x * c - z * s) * scale, oy + y * scale, oz + (x * s + z * c) * scale]
}

/** 面と線を積む道具。静的な舞台と、毎フレーム作り直す動くもの（牛・ケーブルカー）の両方で使う */
export function createBuilder(faces: Face[], lines: Line[]) {
  function face(input: Vec3[], col: RGB, center: Vec3, o: FaceOptions = {}): void {
    const first = input[0]
    const second = input[1]
    const third = input[2]
    if (!first || !second || !third) return
    let pts = input
    let n = nrm(crs(sub(second, first), sub(third, first)))
    const c = avg(pts)
    if (dot3(n, sub(c, center)) < 0) {
      pts = [...pts].reverse()
      n = [-n[0], -n[1], -n[2]]
    }
    const sh = 0.55 + 0.45 * Math.max(0, dot3(n, LIGHT))
    faces.push({
      p: pts,
      n,
      ctr: c,
      rgb: [col[0] * sh, col[1] * sh, col[2] * sh],
      a: o.a ?? 0.5,
      edge: o.edge ?? [Math.min(255, col[0] * 0.6 + 120), Math.min(255, col[1] * 0.6 + 130), Math.min(255, col[2] * 0.6 + 150)],
      ea: o.ea ?? 0.75,
      glow: o.glow ?? 0,
      tier: o.tier ?? 0,
    })
  }

  function line(a: Vec3, b: Vec3, col: RGB, o: LineOptions = {}): void {
    lines.push({ a, b, col, a0: o.a ?? 0.8, n: o.n ?? null, w: o.w ?? 1, glow: o.glow ?? 0 })
  }

  function box(f: Transform, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: RGB, o: FaceOptions = {}, cols: BoxColors = {}): void {
    const v: Vec3[] = [f(x0, y0, z0), f(x1, y0, z0), f(x1, y0, z1), f(x0, y0, z1), f(x0, y1, z0), f(x1, y1, z0), f(x1, y1, z1), f(x0, y1, z1)]
    const [v0, v1, v2, v3, v4, v5, v6, v7] = v as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]
    const c = f((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    face([v4, v5, v6, v7], cols.top ?? col, c, o)
    face([v0, v1, v5, v4], cols.front ?? col, c, o)
    face([v2, v3, v7, v6], cols.back ?? col, c, o)
    face([v1, v2, v6, v5], cols.right ?? col, c, o)
    face([v3, v0, v4, v7], cols.left ?? col, c, o)
    if (o.bottom) face([v0, v1, v2, v3], col, c, o)
  }

  function gable(f: Transform, x0: number, z0: number, x1: number, z1: number, y0: number, hg: number, col: RGB, gcol: RGB, o: FaceOptions): void {
    const zm = (z0 + z1) / 2
    const cen = f((x0 + x1) / 2, y0 - 0.01, zm)
    const a = f(x0, y0, z0)
    const b = f(x1, y0, z0)
    const c = f(x1, y0, z1)
    const d = f(x0, y0, z1)
    const r0 = f(x0, y0 + hg, zm)
    const r1 = f(x1, y0 + hg, zm)
    face([a, b, r1, r0], col, cen, o)
    face([c, d, r0, r1], col, cen, o)
    face([a, d, r0], gcol, cen, o)
    face([b, c, r1], gcol, cen, o)
  }

  /** 腰折れ屋根。棟は x 方向、片側の幅の 55% で折れる */
  function gambrel(f: Transform, x0: number, z0: number, x1: number, z1: number, y0: number, hg: number, col: RGB, gcol: RGB, o: FaceOptions): void {
    const zm = (z0 + z1) / 2
    const hw = (z1 - z0) / 2
    const cen = f((x0 + x1) / 2, y0 - 0.02, zm)
    const prof: [number, number][] = [[z0, y0], [zm - hw * 0.5, y0 + hg * 0.68], [zm, y0 + hg], [zm + hw * 0.5, y0 + hg * 0.68], [z1, y0]]
    for (let k = 0; k < 4; k++) {
      const p = prof[k]
      const q = prof[k + 1]
      if (!p || !q) continue
      face([f(x0, p[1], p[0]), f(x1, p[1], p[0]), f(x1, q[1], q[0]), f(x0, q[1], q[0])], col, cen, o)
    }
    face(prof.map(p => f(x0, p[1], p[0])), gcol, f((x0 + x1) / 2, y0 + hg * 0.3, zm), o)
    face(prof.map(p => f(x1, p[1], p[0])), gcol, f((x0 + x1) / 2, y0 + hg * 0.3, zm), o)
  }

  /** 円柱。top が false なら蓋をしない */
  function cyl(f: Transform, x: number, y: number, z: number, r: number, h: number, seg: number, col: RGB, o: FaceOptions, top: RGB | false | null = null): void {
    const cen = f(x, y + h / 2, z)
    const tp: Vec3[] = []
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU
      const a1 = (i + 1) / seg * TAU
      face([f(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r), f(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r), f(x + Math.cos(a1) * r, y + h, z + Math.sin(a1) * r), f(x + Math.cos(a0) * r, y + h, z + Math.sin(a0) * r)], col, cen, o)
      tp.push(f(x + Math.cos(a0) * r, y + h, z + Math.sin(a0) * r))
    }
    if (top !== false) face(tp, top ?? col, cen, o)
  }

  function dome(f: Transform, x: number, y: number, z: number, r: number, seg: number, rings: number, col: RGB, o: FaceOptions): void {
    const cen = f(x, y, z)
    const P = (a: number, b: number) => f(x + Math.cos(a) * Math.cos(b) * r, y + Math.sin(b) * r, z + Math.sin(a) * Math.cos(b) * r)
    for (let k = 0; k < rings; k++) {
      const b0 = k / rings * Math.PI / 2
      const b1 = (k + 1) / rings * Math.PI / 2
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * TAU
        const a1 = (i + 1) / seg * TAU
        if (k === rings - 1) face([P(a0, b0), P(a1, b0), P(a0, b1)], col, cen, o)
        else face([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)], col, cen, o)
      }
    }
  }

  function circleLines(f: Transform, x: number, y: number, z: number, r: number, seg: number, col: RGB, o: LineOptions, axis: 'y' | 'z' = 'y'): void {
    const pts: Vec3[] = []
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU
      pts.push(axis === 'z' ? f(x + Math.cos(a) * r, y + Math.sin(a) * r, z) : f(x + Math.cos(a) * r, y, z + Math.sin(a) * r))
    }
    for (let i = 0; i < seg; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (a && b) line(a, b, col, o)
    }
  }

  return { face, line, box, gable, gambrel, cyl, dome, circleLines }
}

// ================= 地形：台座の上に続く1つの山並み =================
// 南西だけが低地で、ほかは箱根の山々

const sstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const gs = (dx: number, dz: number, r: number): number => Math.exp(-(dx * dx + dz * dz) / (2 * r * r))

/** 名所の位置（x, z） */
const THP: [number, number] = [-0.58, -0.56]
const OBP: [number, number] = [0.02, 0.1]
const TNP: [number, number] = [0.4, -0.5]
const JKP: [number, number] = [0.68, 0.34]

/** 名所の高さ。約 20 m／310 m／240 m／770 m */
const H_TOWN = 0.03
const H_OB = 0.28
const H_TN = 0.2
const H_JK = 0.7

function lowland(x: number, z: number): number {
  return sstep(0.25, -0.35, (x + z) * 0.7 + 0.25)
}

/** 地表の高さ */
export function heightAt(x: number, z: number): number {
  const low = lowland(x, z)
  let h = 0.03 + (1 - low) * 0.3
  h += 0.3 * gs(x - JKP[0], z - JKP[1], 0.3)
  h += 0.2 * gs(x - 0.2, z - 0.9, 0.35)
  h += 0.16 * gs(x + 0.65, z - 0.85, 0.3)
  h += 0.2 * gs(x - 0.92, z + 0.5, 0.3)
  h += 0.12 * gs(x - 0.1, z + 0.98, 0.25)
  h += (1 - low) * 0.035 * (Math.sin(x * 9 + z * 4) * Math.sin(z * 8 - x * 3) + 0.5 * Math.sin(x * 19 - z * 15))
  h = H_TOWN + (h - H_TOWN) * (1 - low * 0.92)
  const t = gs(x - THP[0], z - THP[1], 0.3)
  h = h * (1 - t) + H_TOWN * t
  const b = gs(x - TNP[0], z - TNP[1], 0.25)
  h = h * (1 - b) + H_TN * b
  const o = Math.min(1, gs(x - OBP[0] + 0.04, z - OBP[1] + 0.01, 0.1) * 1.25)
  h = h * (1 - o) + H_OB * o
  const j = Math.min(1, gs(x - JKP[0], z - JKP[1], 0.1) * 1.2)
  h = h * (1 - j) + H_JK * j
  return h
}

export const BASE_Y = -0.16

/** 函南町役場・月光天文台・十国峠・酪農王国オラッチェの位置と大きさ */
export const THC: Vec3 = [THP[0], H_TOWN, THP[1]]
export const THS = 1.15
export const OBC: Vec3 = [OBP[0], H_OB, OBP[1]]
export const OBS = 0.45
export const JKC: Vec3 = [JKP[0], H_JK, JKP[1]]
export const TNC: Vec3 = [TNP[0], H_TN, TNP[1]]

/** 十国峠のケーブルカーの線路（下の駅 → 山頂駅） */
export const FUN1: Vec3 = [JKC[0] - 0.12, H_JK + 0.006, JKC[2] - 0.03]
export const FUN0: [number, number] = [0.3, 0.2]

export function funicularAt(u: number): Vec3 {
  const x = FUN0[0] + (FUN1[0] - FUN0[0]) * u
  const z = FUN0[1] + (FUN1[2] - FUN0[1]) * u
  return [x, heightAt(x, z) + 0.008, z]
}

/** 牧場の柵の内側 */
export const PASTURE = { x0: TNC[0] - 0.24, x1: TNC[0] + 0.26, z0: TNC[2] - 0.26, z1: TNC[2] - 0.09 }

// ================= 富士山（粒子）と遠景 =================

/** 函南町から見た富士山の半分の幅（v は山頂からの深さ 0〜1、side は −1 左／1 右）。平らな山頂、凹んだ裾、右の宝永山のふくらみ */
export function fujiHalfWidth(v: number, side: number): number {
  let w = 0.04 + 0.96 * Math.pow(v, 1.22)
  if (v < 0.02) w = 0.04 + 0.006 * Math.sin(v * 400 * side)
  if (side > 0) w += 0.05 * Math.exp(-Math.pow((v - 0.36) / 0.06, 2)) - 0.012 * Math.exp(-Math.pow((v - 0.44) / 0.04, 2))
  else w += 0.012 * Math.sin(v * 31)
  return w
}

const fujiSnow = (u: number): number => 0.26 + 0.03 * Math.sin(u * 23) + 0.02 * Math.sin(u * 51 + 1) + 0.14 * Math.pow(Math.max(0, Math.sin(u * 41 + 0.6)), 10) + 0.09 * Math.pow(Math.max(0, Math.sin(u * 67 + 2)), 12)

export interface FujiParticle {
  u: number
  v: number
  snow: boolean
  edge: boolean
  lit: number
  tw: number
  sz: number
}

/** 遠景の海（駿河湾・相模湾）の粒子。b は方位（北から時計回り） */
export interface SeaParticle {
  b: number
  t: number
  ends: number
  tw: number
  sp: number
  sz: number
}

/** 伊豆の山並みの粒子 */
export interface RidgeParticle {
  b: number
  h: number
  t: number
  ends: number
  L: number
  tw: number
  sz: number
}

export interface CloudParticle {
  x: number
  y: number
  sp: number
  a: number
  sz: number
}

export interface Tree {
  p: Vec3
  kind: number
  sz: number
}

export interface Azalea {
  p: Vec3
  c: number
}

export interface ObservatoryDome {
  c: Vec3
  r: number
  ph: number
  tube: boolean
}

export interface KannamiScene {
  faces: Face[]
  lines: Line[]
  trees: Tree[]
  azaleas: Azalea[]
  fuji: FujiParticle[]
  sea: SeaParticle[]
  izu: RidgeParticle[]
  fujiClouds: CloudParticle[]
  underClouds: CloudParticle[]
  domes: ObservatoryDome[]
}

/** 粒子の数。低性能の端末では減らす（USM §5「パフォーマンス」） */
export interface SceneDensity {
  /** 1 が UI モックの数。富士山・海・山並み・雲の粒子に掛ける */
  particles: number
}

const D2R = Math.PI / 180

const TILE: RGB = [112, 72, 64]
const GLASS: RGB = [150, 206, 240]
const WHITE: RGB = [232, 234, 238]

function terrainColor(x: number, z: number, h: number): RGB {
  if (gs(x - TNP[0], z - TNP[1], 0.25) > 0.45) {
    const fi = (Math.floor((x + 2) * 9) + Math.floor((z + 2) * 11)) % 3
    const pasture: RGB[] = [[104, 168, 88], [128, 182, 96], [92, 154, 82]]
    return pasture[fi] ?? [104, 168, 88]
  }
  if (Math.hypot(x - JKP[0], z - JKP[1]) < 0.2 && h > 0.55) return [150, 158, 96]
  if (lowland(x, z) > 0.6) return [62, 86, 92]
  if (h > 0.62) return [128, 142, 92]
  return [34, 84, 60]
}

function buildTerrain(b: ReturnType<typeof createBuilder>): void {
  const { face, line } = b
  const G = 40
  const CS = 2 / G
  const gh: number[][] = []
  for (let i = 0; i <= G; i++) {
    const row: number[] = []
    for (let j = 0; j <= G; j++) row.push(heightAt(-1 + i * CS, -1 + j * CS))
    gh.push(row)
  }
  const at = (i: number, j: number): number => gh[i]?.[j] ?? 0
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const x0 = -1 + i * CS
      const z0 = -1 + j * CS
      const x1 = x0 + CS
      const z1 = z0 + CS
      const pts: Vec3[] = [[x0, at(i, j), z0], [x1, at(i + 1, j), z0], [x1, at(i + 1, j + 1), z1], [x0, at(i, j + 1), z1]]
      const hm = (at(i, j) + at(i + 1, j + 1)) / 2
      face(pts, terrainColor(x0 + CS / 2, z0 + CS / 2, hm), [x0, -9, z0], { a: 0.8, ea: 0.13, edge: [120, 190, 170], tier: 1 })
    }
  }
  // 地形に沿った台座の側面
  for (let i = 0; i < G; i++) {
    const x0 = -1 + i * CS
    const x1 = x0 + CS
    const o: FaceOptions = { a: 0.7, ea: 0.3, edge: [120, 160, 220], tier: 1 }
    const c: RGB = [30, 40, 60]
    face([[x0, BASE_Y, -1], [x1, BASE_Y, -1], [x1, at(i + 1, 0), -1], [x0, at(i, 0), -1]], c, [0, 0, 0], o)
    face([[x0, BASE_Y, 1], [x1, BASE_Y, 1], [x1, at(i + 1, G), 1], [x0, at(i, G), 1]], c, [0, 0, 0], o)
    face([[-1, BASE_Y, x0], [-1, BASE_Y, x1], [-1, at(0, i + 1), x1], [-1, at(0, i), x0]], c, [0, 0, 0], o)
    face([[1, BASE_Y, x0], [1, BASE_Y, x1], [1, at(G, i + 1), x1], [1, at(G, i), x0]], c, [0, 0, 0], o)
  }
  face([[-1, BASE_Y, -1], [1, BASE_Y, -1], [1, BASE_Y, 1], [-1, BASE_Y, 1]], [26, 36, 58], [0, 1, 0], { a: 0.7, ea: 0.6, edge: [120, 160, 220], tier: 1 })
  const edges: [number, number, number, number][] = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]
  for (const e of edges) {
    line([e[0], BASE_Y, e[1]], [e[2], BASE_Y, e[3]], [150, 190, 240], { a: 0.8, w: 1.4 })
    line([e[0], BASE_Y, e[1]], [e[0], heightAt(e[0], e[1]), e[1]], [150, 190, 240], { a: 0.7 })
  }
  // 標高が読めるよう、光る等高線（マーチングスクエア）
  for (const lv of [0.12, 0.24, 0.36, 0.48, 0.6]) {
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const c: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]
        const pts: Vec3[] = []
        for (let k = 0; k < 4; k++) {
          const a = c[k]
          const bb = c[(k + 1) % 4]
          if (!a || !bb) continue
          const ha = at(a[0], a[1])
          const hb = at(bb[0], bb[1])
          if ((ha < lv) !== (hb < lv)) {
            const t = (lv - ha) / (hb - ha)
            pts.push([-1 + (a[0] + (bb[0] - a[0]) * t) * CS, lv + 0.004, -1 + (a[1] + (bb[1] - a[1]) * t) * CS])
          }
        }
        const p0 = pts[0]
        const p1 = pts[1]
        if (p0 && p1) line(p0, p1, [150, 235, 200], { a: 0.32, n: [0, 1, 0] })
      }
    }
  }
  // 道路：地面に淡い破線の光
  const drape = (pl: [number, number][], col: RGB, a: number) => {
    for (let k = 0; k < pl.length - 1; k++) {
      const p0 = pl[k]
      const p1 = pl[k + 1]
      if (!p0 || !p1) continue
      const n = 10
      const p = (u: number): Vec3 => {
        const x = p0[0] + (p1[0] - p0[0]) * u
        const z = p0[1] + (p1[1] - p0[1]) * u
        return [x, heightAt(x, z) + 0.006, z]
      }
      for (let s = 0; s < n; s += 2) line(p(s / n), p((s + 1) / n), col, { a, n: [0, 1, 0] })
    }
  }
  drape([[-0.98, -0.3], [-0.6, -0.36], [-0.3, -0.2], [-0.12, 0.0], [0.2, 0.3], [0.45, 0.38], [0.62, 0.42]], [255, 226, 180], 0.5)
  drape([[-0.6, -0.36], [-0.3, -0.6], [0.0, -0.62], [0.22, -0.52]], [255, 226, 180], 0.5)
}

/** 函南町役場：正面はガラスの円筒と冠のリング、タイルの両翼、曲線の庇。背面は2つのガラスの張り出しとパーゴラ */
function buildTownHall(b: ReturnType<typeof createBuilder>): void {
  const { face, line, box, cyl, circleLines } = b
  const f = transform(THC[0], THC[1], THC[2], 0, THS)
  const HH = 0.34
  const wing: FaceOptions = { a: 0.62, ea: 0.85 }
  box(f, -0.3, 0, -0.1, -0.06, HH, 0.1, TILE, wing)
  box(f, 0.06, 0, -0.1, 0.3, HH * 0.92, 0.1, TILE, wing)
  box(f, -0.07, 0, -0.04, 0.07, HH * 0.96, 0.1, GLASS, { a: 0.4, ea: 0.9, glow: 0.6 })
  // 屋上のパラペットと設備
  box(f, -0.3, HH, -0.1, -0.06, HH + 0.012, 0.1, [150, 150, 158], { a: 0.4, ea: 0.8 })
  box(f, 0.06, HH * 0.92, -0.1, 0.3, HH * 0.92 + 0.012, 0.1, [150, 150, 158], { a: 0.4, ea: 0.8 })
  box(f, -0.24, HH + 0.012, -0.03, -0.14, HH + 0.04, 0.05, [120, 124, 134], { a: 0.5, ea: 0.8 })
  // 各階のルーバーと、その間の窓の帯
  for (let k = 1; k <= 6; k++) {
    const y = k * HH / 6.6
    const wings: [number, number, number][] = [[-0.3, -0.06, HH], [0.06, 0.3, HH * 0.92]]
    for (const [x0, x1, hh] of wings) {
      if (y > hh) continue
      for (let j = 0; j < 4; j++) {
        const yy = y - j * 0.009
        line(f(x0, yy, -0.101), f(x1, yy, -0.101), [224, 164, 134], { a: 0.6, n: [0, 0, -1] })
        line(f(x0, yy, 0.101), f(x1, yy, 0.101), [224, 164, 134], { a: 0.45, n: [0, 0, 1] })
      }
      line(f(x0, y - 0.04, -0.1015), f(x1, y - 0.04, -0.1015), [170, 220, 250], { a: 0.5, n: [0, 0, -1], w: 2 })
      for (let j = 0; j < 3; j++) {
        const yy = y - j * 0.01
        line(f(x0 - 0.001, yy, -0.1), f(x0 - 0.001, yy, 0.1), [224, 164, 134], { a: 0.45, n: [-1, 0, 0] })
        line(f(x1 + 0.001, yy, -0.1), f(x1 + 0.001, yy, 0.1), [224, 164, 134], { a: 0.45, n: [1, 0, 0] })
      }
    }
  }
  // 左翼：西面の柱と、積み重なるバルコニー
  for (let k = 0; k < 5; k++) {
    const z = -0.09 + k * 0.045
    line(f(-0.301, 0, z), f(-0.301, HH, z), [200, 150, 130], { a: 0.6, n: [-1, 0, 0] })
  }
  for (let k = 1; k < 6; k++) {
    box(f, -0.325, k * HH / 6 - 0.006, -0.07, -0.3, k * HH / 6, -0.02, WHITE, { a: 0.55, ea: 0.8 })
    box(f, -0.3, k * HH / 6 - 0.006, -0.125, -0.24, k * HH / 6, -0.1, WHITE, { a: 0.55, ea: 0.8 })
  }
  // 屋根より高いガラスの円筒、階のリング、冠のリングと放射状のフィン
  cyl(f, 0, 0, -0.1, 0.075, HH * 1.12, 20, GLASS, { a: 0.3, ea: 0.8, glow: 1 }, [200, 230, 255])
  for (let k = 1; k <= 7; k++) circleLines(f, 0, k * HH * 1.12 / 7.5, -0.1, 0.078, 20, [225, 245, 255], { a: 0.8, glow: 0.5, w: 1.3 })
  circleLines(f, 0, HH * 1.16, -0.1, 0.112, 28, [240, 248, 255], { a: 0.95, glow: 1, w: 1.6 })
  circleLines(f, 0, HH * 1.16, -0.1, 0.096, 28, [240, 248, 255], { a: 0.6, glow: 1 })
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU
    line(f(Math.cos(a) * 0.075, HH * 1.12, -0.1 + Math.sin(a) * 0.075), f(Math.cos(a) * 0.112, HH * 1.16, -0.1 + Math.sin(a) * 0.112), [240, 248, 255], { a: 0.8, glow: 0.6 })
  }
  // 柱に載った白い曲線の庇（正面右）と旗竿
  const cp: Vec3[] = []
  for (let i = 0; i <= 10; i++) {
    const a = -0.2 + i / 10 * 1.3
    cp.push([-0.02 + Math.cos(a) * 0.22, 0.075, -0.13 - Math.sin(a) * 0.07])
  }
  for (let i = 0; i < 10; i++) {
    const a = cp[i]
    const c = cp[i + 1]
    if (!a || !c) continue
    face([f(a[0], a[1], a[2]), f(c[0], c[1], c[2]), f(c[0], c[1], c[2] - 0.04), f(a[0], a[1], a[2] - 0.04)], WHITE, f(a[0], 0, a[2]), { a: 0.6, ea: 0.9 })
    if (i % 2 === 0) {
      line(f(a[0], 0, a[2] - 0.035), f(a[0], a[1], a[2] - 0.035), WHITE, { a: 0.8 })
      line(f(a[0], 0, a[2] - 0.005), f(a[0], a[1], a[2] - 0.005), WHITE, { a: 0.6 })
    }
  }
  line(f(0.36, 0, -0.2), f(0.36, 0.32, -0.2), [230, 230, 236], { a: 0.85 })
  // 背面：2つのガラスの張り出し、その間の奥まったガラス、長いパーゴラ
  for (const bx of [-0.16, 0.16]) {
    for (let k = 0; k < 7; k++) box(f, bx - 0.04, k * 0.05, 0.1, bx + 0.04, k * 0.05 + 0.045, 0.135, GLASS, { a: 0.35, ea: 0.85, glow: 0.7 })
    box(f, bx - 0.045, HH, 0.07, bx + 0.045, HH + 0.05, 0.135, GLASS, { a: 0.35, ea: 0.9, glow: 0.8 })
  }
  for (let k = 1; k < 7; k++) line(f(-0.07, k * 0.047, 0.1005), f(0.07, k * 0.047, 0.1005), [200, 235, 255], { a: 0.6, n: [0, 0, 1] })
  box(f, -0.32, 0.055, 0.14, 0.32, 0.062, 0.2, WHITE, { a: 0.55, ea: 0.85 })
  for (let k = 0; k <= 8; k++) {
    const x = -0.32 + k * 0.08
    line(f(x, 0, 0.195), f(x, 0.055, 0.195), WHITE, { a: 0.6 })
  }
}

/** 低地が町と分かるよう、控えめな家並み */
function buildHouses(b: ReturnType<typeof createBuilder>): void {
  const { box, gable } = b
  const r = seeded(21)
  let n = 0
  let tries = 0
  const spots: [number, number][] = []
  while (n < 26 && tries < 2000) {
    tries++
    const x = -0.96 + r() * 1.2
    const z = -0.96 + r() * 1.2
    if (lowland(x, z) < 0.8) continue
    if (Math.abs(x - THC[0]) < 0.46 && Math.abs(z - THC[2]) < 0.32) continue
    if (spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 0.1)) continue
    spots.push([x, z])
    n++
    const f = transform(x, heightAt(x, z), z, (r() - 0.5) * 0.8, 1)
    const w = 0.028 + r() * 0.012
    box(f, -w, 0, -0.02, w, 0.026, 0.02, [170, 176, 190], { a: 0.4, ea: 0.45 })
    gable(f, -w, -0.02, w, 0.02, 0.026, 0.018, [110, 118, 140], [170, 176, 190], { a: 0.45, ea: 0.45 })
  }
}

/** 月光天文台 */
function buildObservatory(b: ReturnType<typeof createBuilder>, domes: ObservatoryDome[]): void {
  const { face, line, box, cyl, dome, circleLines } = b
  const SILVER: RGB = [206, 212, 224]
  const OBW: RGB = [236, 236, 230]
  const OBG: RGB = [150, 150, 136]
  const f = transform(OBC[0], OBC[1], OBC[2], 0, OBS)
  // 広い軒と大きな銀のドームのプラネタリウム棟
  box(f, -0.17, 0, -0.18, 0.01, 0.12, -0.02, OBW, { a: 0.62, ea: 0.9 })
  box(f, -0.2, 0.12, -0.21, 0.04, 0.135, 0.01, OBW, { a: 0.7, ea: 0.95 })
  box(f, -0.14, 0.135, -0.16, -0.02, 0.16, -0.04, OBW, { a: 0.6, ea: 0.9 })
  dome(f, -0.08, 0.16, -0.1, 0.085, 18, 6, SILVER, { a: 0.5, ea: 0.9, glow: 0.6 })
  const disc: Vec3[] = []
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * TAU
    disc.push(f(-0.08 + Math.cos(a) * 0.045, 0.07 + Math.sin(a) * 0.045, -0.183))
  }
  face(disc, [40, 74, 210], f(-0.08, 0.07, 0), { a: 0.85, ea: 0.9, edge: [140, 180, 255], glow: 0.4 })
  circleLines(f, -0.08, 0.075, -0.186, 0.014, 12, [230, 240, 255], { a: 0.95, n: [0, 0, -1] }, 'z')
  // 円盤の両側の縦長の窓、入口のポーチ
  for (const w of [[-0.155, -0.14], [-0.02, -0.005]] as const) {
    line(f(w[0], 0.05, -0.181), f(w[0], 0.1, -0.181), [170, 215, 245], { a: 0.8, n: [0, 0, -1], w: 2 })
    line(f(w[1], 0.05, -0.181), f(w[1], 0.1, -0.181), [170, 215, 245], { a: 0.8, n: [0, 0, -1], w: 2 })
  }
  box(f, -0.13, 0.04, -0.215, -0.03, 0.045, -0.18, OBW, { a: 0.6, ea: 0.9 })
  line(f(-0.125, 0, -0.21), f(-0.125, 0.04, -0.21), OBW, { a: 0.7 })
  line(f(-0.035, 0, -0.21), f(-0.035, 0.04, -0.21), OBW, { a: 0.7 })
  // 丸窓のある低い白い翼
  box(f, -0.42, 0, -0.16, -0.17, 0.07, -0.02, OBW, { a: 0.55, ea: 0.85 })
  for (let k = 0; k < 4; k++) circleLines(f, -0.39 + k * 0.06, 0.045, -0.162, 0.008, 8, [140, 220, 170], { a: 0.9, n: [0, 0, -1] }, 'z')
  box(f, 0.01, 0, -0.14, 0.03, 0.07, -0.04, OBW, { a: 0.55, ea: 0.85 })
  // 窓枠のある灰色の4階建ての観測棟
  box(f, 0.03, 0, -0.06, 0.25, 0.24, 0.16, OBG, { a: 0.64, ea: 0.85 })
  const win = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: Vec3) => {
    const sides: [Vec3, Vec3][] = [[p0, p1], [p1, p2], [p2, p3], [p3, p0]]
    for (const e of sides) line(e[0], e[1], [190, 225, 245], { a: 0.8, n })
  }
  for (let k = 0; k < 4; k++) {
    const y = 0.025 + k * 0.055
    for (let j = 0; j < 4; j++) {
      const x = 0.055 + j * 0.05
      const w = j === 3 ? 0.03 : 0.012
      win(f(x, y, -0.061), f(x + w, y, -0.061), f(x + w, y + 0.028, -0.061), f(x, y + 0.028, -0.061), [0, 0, -1])
    }
    for (let j = 0; j < 3; j++) {
      const z = -0.035 + j * 0.065
      win(f(0.251, y, z), f(0.251, y, z + 0.03), f(0.251, y + 0.026, z + 0.03), f(0.251, y + 0.026, z), [1, 0, 0])
    }
  }
  // 屋上テラスの手すりと支柱、暗い日除けの枠
  const rails: [number, number, number, number][] = [[0.03, -0.06, 0.25, -0.06], [0.03, -0.06, 0.03, 0.16], [0.25, -0.06, 0.25, 0.16], [0.03, 0.16, 0.25, 0.16]]
  for (const r of rails) {
    line(f(r[0], 0.262, r[1]), f(r[2], 0.262, r[3]), [220, 225, 235], { a: 0.8 })
    line(f(r[0], 0.251, r[1]), f(r[2], 0.251, r[3]), [220, 225, 235], { a: 0.5 })
  }
  for (let k = 0; k <= 6; k++) line(f(0.03 + k * 0.0367, 0.24, -0.06), f(0.03 + k * 0.0367, 0.262, -0.06), [220, 225, 235], { a: 0.6 })
  box(f, 0.035, 0.275, -0.055, 0.12, 0.28, 0.01, [60, 70, 90], { a: 0.6, ea: 0.7 })
  for (const p of [[0.035, -0.055], [0.12, -0.055], [0.035, 0.01], [0.12, 0.01]] as const) line(f(p[0], 0.24, p[1]), f(p[0], 0.275, p[1]), [150, 160, 180], { a: 0.7 })
  // 屋上の小さな銀のドームと、奥の角の大きな白いドーム
  cyl(f, 0.15, 0.24, 0.02, 0.03, 0.03, 12, OBG, { a: 0.55, ea: 0.85 })
  dome(f, 0.15, 0.27, 0.02, 0.03, 12, 4, SILVER, { a: 0.5, ea: 0.95, glow: 0.6 })
  cyl(f, 0.2, 0.24, 0.11, 0.042, 0.02, 14, OBW, { a: 0.55, ea: 0.85 })
  dome(f, 0.2, 0.26, 0.11, 0.042, 14, 5, [232, 236, 242], { a: 0.5, ea: 0.95, glow: 0.6 })
  domes.push({ c: f(0.15, 0.27, 0.02), r: 0.03 * OBS, ph: 0, tube: false }, { c: f(0.2, 0.26, 0.11), r: 0.042 * OBS, ph: 2, tube: true })
  for (let i = 0; i < 6; i++) {
    const a0 = i / 6 * Math.PI
    const a1 = (i + 1) / 6 * Math.PI
    face([f(0.17 + Math.cos(a0) * 0.03, 0.05 + Math.sin(a0) * 0.02, -0.06), f(0.17 + Math.cos(a1) * 0.03, 0.05 + Math.sin(a1) * 0.02, -0.06), f(0.17 + Math.cos(a1) * 0.03, 0.05 + Math.sin(a1) * 0.02, -0.11), f(0.17 + Math.cos(a0) * 0.03, 0.05 + Math.sin(a0) * 0.02, -0.11)], OBW, f(0.17, 0.04, -0.085), { a: 0.6, ea: 0.9 })
  }
}

/** 十国峠：円盤の屋根の丸いガラスの展望台、テラス、すれ違う2両のケーブルカーの直線の線路 */
function buildJukkoku(b: ReturnType<typeof createBuilder>, azaleas: Azalea[]): void {
  const { face, line, box, cyl, circleLines } = b
  const f = transform(JKC[0], JKC[1], JKC[2], 0.5, 1)
  // 赤茶のテラス
  const ter = ([[-0.1, -0.1], [0.14, -0.11], [0.2, -0.03], [0.19, 0.08], [0.05, 0.11], [-0.1, 0.07], [-0.14, -0.02]] as const).map(p => f(p[0], 0.004, p[1]))
  face(ter, [156, 96, 78], f(0, -1, 0), { a: 0.75, ea: 0.8, edge: [230, 170, 150] })
  for (let k = 0; k < ter.length; k++) {
    const a = ter[k]
    const c = ter[(k + 1) % ter.length]
    if (a && c) line([a[0], a[1] + 0.012, a[2]], [c[0], c[1] + 0.012, c[2]], [230, 220, 210], { a: 0.6 })
  }
  // 展望台：ガラス張りの2層、間の帯、広い平らな円盤の屋根
  cyl(f, -0.02, 0.004, 0, 0.07, 0.05, 24, GLASS, { a: 0.34, ea: 0.6, glow: 0.8 }, false)
  circleLines(f, -0.02, 0.028, 0, 0.072, 24, WHITE, { a: 0.95, w: 2 })
  circleLines(f, -0.02, 0.006, 0, 0.072, 24, WHITE, { a: 0.7 })
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU
    line(f(-0.02 + Math.cos(a) * 0.071, 0.004, Math.sin(a) * 0.071), f(-0.02 + Math.cos(a) * 0.071, 0.054, Math.sin(a) * 0.071), [230, 244, 255], { a: 0.7 })
  }
  cyl(f, -0.02, 0.054, 0, 0.082, 0.008, 24, [226, 232, 240], { a: 0.75, ea: 0.95 }, [214, 226, 238])
  // 柱に載った入口の庇
  box(f, 0.05, 0.03, -0.025, 0.1, 0.035, 0.025, WHITE, { a: 0.65, ea: 0.9 })
  line(f(0.097, 0.004, -0.022), f(0.097, 0.03, -0.022), WHITE, { a: 0.8 })
  line(f(0.097, 0.004, 0.022), f(0.097, 0.03, 0.022), WHITE, { a: 0.8 })
  // 展望台の横の山頂駅の屋根
  box(f, -0.13, 0.004, -0.02, -0.09, 0.03, 0.03, [190, 180, 170], { a: 0.6, ea: 0.85 }, { top: [150, 70, 62] })

  // ケーブルカー：西の斜面を下る直線の線路、枕木、架線の柱
  const dx = FUN1[0] - FUN0[0]
  const dz = FUN1[2] - FUN0[1]
  const l = Math.hypot(dx, dz)
  const nx = -dz / l
  const nz = dx / l
  const N = 26
  for (let k = 0; k < N; k++) {
    const a = funicularAt(k / N)
    const c = funicularAt((k + 1) / N)
    const passing = Math.abs((k + 0.5) / N - 0.5) < 0.12
    const w = passing ? 0.022 : 0.009
    for (const s of [-1, 1]) line([a[0] + nx * w * s, a[1], a[2] + nz * w * s], [c[0] + nx * w * s, c[1], c[2] + nz * w * s], [220, 220, 228], { a: 0.9, w: 1.3 })
    line([a[0] - nx * (w + 0.006), a[1], a[2] - nz * (w + 0.006)], [a[0] + nx * (w + 0.006), a[1], a[2] + nz * (w + 0.006)], [170, 150, 140], { a: 0.6 })
    if (k % 4 === 0) line([a[0] + nx * 0.03, a[1], a[2] + nz * 0.03], [a[0] + nx * 0.03, a[1] + 0.04, a[2] + nz * 0.03], [200, 200, 210], { a: 0.6 })
  }
  // 線路沿いのつつじ
  const r = seeded(4)
  for (let k = 0; k < 46; k++) {
    const u = 0.05 + r() * 0.88
    const a = funicularAt(u)
    const s = r() < 0.5 ? -1 : 1
    const d = 0.035 + r() * 0.03
    const x = a[0] - dz / l * d * s
    const z = a[2] + dx / l * d * s
    azaleas.push({ p: [x, heightAt(x, z) + 0.012, z], c: r() < 0.6 ? 0 : 1 })
  }
}

/** 酪農王国オラッチェ：えんじの腰折れ屋根の濃い灰色の牛舎、鐘楼、天窓の庇、長い作業小屋、温室、柵で囲った牧場 */
function buildOratche(b: ReturnType<typeof createBuilder>): void {
  const { face, line, box, gable, gambrel } = b
  const GREY: RGB = [82, 84, 92]
  const MAROON: RGB = [150, 52, 60]
  const MAROON2: RGB = [176, 70, 76]
  const f = transform(TNC[0] + 0.02, TNC[1], TNC[2] + 0.08, 0, 1.15)
  const o: FaceOptions = { a: 0.66, ea: 0.9 }
  // 本館：並んだ2棟の腰折れ屋根の牛舎（棟は前後方向）
  const fr = transform(TNC[0] + 0.02, TNC[1], TNC[2] + 0.08, Math.PI / 2, 1.15)
  box(fr, -0.07, 0, -0.1, 0.07, 0.06, 0.0, GREY, o)
  gambrel(fr, -0.075, -0.1, 0.075, 0.0, 0.06, 0.05, MAROON, GREY, o)
  box(fr, -0.05, 0, 0.0, 0.07, 0.05, 0.08, GREY, o)
  gambrel(fr, -0.055, 0.0, 0.075, 0.08, 0.05, 0.04, MAROON, GREY, o)
  // 妻面の窓
  for (const w of [[-0.07, 0.085], [-0.03, 0.085], [-0.05, 0.06]] as const) {
    const a = fr(-0.0705, w[1], w[0])
    const c = fr(-0.0705, w[1], w[0] + 0.018)
    const d = fr(-0.0705, w[1] - 0.014, w[0] + 0.018)
    const e = fr(-0.0705, w[1] - 0.014, w[0])
    const sides: [Vec3, Vec3][] = [[a, c], [c, d], [d, e], [e, a]]
    for (const s of sides) line(s[0], s[1], [235, 240, 250], { a: 0.85 })
  }
  // 鐘楼：背の高い四角い塔、えんじの小さな四角錐の屋根、2つの鐘の腕木
  box(f, 0.012, 0, -0.045, 0.042, 0.2, -0.015, GREY, { a: 0.7, ea: 0.95 })
  {
    const base = [f(0.008, 0.2, -0.049), f(0.046, 0.2, -0.049), f(0.046, 0.2, -0.011), f(0.008, 0.2, -0.011)]
    const ap = f(0.027, 0.232, -0.03)
    for (let k = 0; k < 4; k++) {
      const p = base[k]
      const q = base[(k + 1) % 4]
      if (p && q) face([p, q, ap], MAROON2, f(0.027, 0.2, -0.03), { a: 0.75, ea: 0.95 })
    }
  }
  line(f(0.027, 0.232, -0.03), f(0.027, 0.25, -0.03), [220, 220, 228], { a: 0.8 })
  line(f(0.042, 0.165, -0.03), f(0.062, 0.165, -0.03), [230, 232, 240], { a: 0.9, w: 1.5 })
  line(f(0.042, 0.145, -0.03), f(0.062, 0.145, -0.03), [230, 232, 240], { a: 0.9, w: 1.5 })
  line(f(0.062, 0.14, -0.03), f(0.062, 0.17, -0.03), [230, 232, 240], { a: 0.8 })
  // 2つのガラスの四角錐の天窓がある入口の庇
  box(f, -0.12, 0.03, -0.12, 0.04, 0.036, -0.07, MAROON2, { a: 0.7, ea: 0.9 })
  for (const sx of [-0.085, -0.02]) {
    const base = [f(sx - 0.022, 0.036, -0.112), f(sx + 0.022, 0.036, -0.112), f(sx + 0.022, 0.036, -0.08), f(sx - 0.022, 0.036, -0.08)]
    const ap = f(sx, 0.056, -0.096)
    for (let k = 0; k < 4; k++) {
      const p = base[k]
      const q = base[(k + 1) % 4]
      if (p && q) face([p, q, ap], [170, 225, 235], f(sx, 0.03, -0.096), { a: 0.4, ea: 0.95, glow: 0.7 })
    }
  }
  for (let k = 0; k < 4; k++) line(f(-0.115 + k * 0.05, 0, -0.118), f(-0.115 + k * 0.05, 0.03, -0.118), [200, 200, 208], { a: 0.7 })
  // 屋根に換気口のある長い作業小屋（東）と、ガラスの温室（西）
  box(f, 0.1, 0, -0.03, 0.3, 0.05, 0.05, GREY, o)
  gable(f, 0.095, -0.035, 0.305, 0.055, 0.05, 0.03, MAROON, GREY, o)
  for (let k = 0; k < 4; k++) box(f, 0.13 + k * 0.045, 0.078, 0.004, 0.145 + k * 0.045, 0.088, 0.016, [200, 200, 206], { a: 0.6, ea: 0.8 })
  box(f, -0.3, 0, -0.01, -0.14, 0.035, 0.06, [170, 225, 235], { a: 0.3, ea: 0.8, glow: 0.5 })
  gable(f, -0.3, -0.01, -0.14, 0.06, 0.035, 0.022, [190, 235, 245], [170, 225, 235], { a: 0.3, ea: 0.8, glow: 0.5 })
  for (let k = 1; k < 6; k++) line(f(-0.3 + k * 0.0267, 0, -0.011), f(-0.3 + k * 0.0267, 0.035, -0.011), [210, 240, 250], { a: 0.6, n: [0, 0, -1] })

  // 牧場を囲む木の柵（建物の手前）
  const c: RGB = [200, 170, 130]
  const run = (ax: number, az: number, bx: number, bz: number) => {
    const n = 9
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n
      const z0 = az + (bz - az) * k / n
      const x1 = ax + (bx - ax) * (k + 1) / n
      const z1 = az + (bz - az) * (k + 1) / n
      line([x0, heightAt(x0, z0), z0], [x0, heightAt(x0, z0) + 0.022, z0], c, { a: 0.85 })
      for (const h of [0.009, 0.018]) line([x0, heightAt(x0, z0) + h, z0], [x1, heightAt(x1, z1) + h, z1], c, { a: 0.75 })
    }
  }
  const P = PASTURE
  run(P.x0, P.z0, P.x1, P.z0)
  run(P.x1, P.z0, P.x1, P.z1)
  run(P.x1, P.z1, P.x0, P.z1)
  run(P.x0, P.z1, P.x0, P.z0)
}

/** 斜面を埋め尽くす森（ビルボードの木） */
function buildForest(trees: Tree[]): void {
  const r = seeded(3)
  const sp = 0.044
  const fdx = FUN1[0] - FUN0[0]
  const fdz = FUN1[2] - FUN0[1]
  const fl = Math.hypot(fdx, fdz)
  for (let x = -0.985; x < 0.99; x += sp) {
    for (let z = -0.985; z < 0.99; z += sp) {
      const px = clamp(x + (r() - 0.5) * sp * 0.9, -0.99, 0.99)
      const pz = clamp(z + (r() - 0.5) * sp * 0.9, -0.99, 0.99)
      const rv = r()
      const kind = Math.floor(r() * 3)
      const sz = 0.75 + r() * 0.6
      const low = lowland(px, pz)
      if (low > 0.75) {
        if (rv > 0.05) continue
      }
      else if (low > 0.3 && rv > 0.55) continue
      if (Math.abs(px - THC[0]) < 0.42 && Math.abs(pz - THC[2]) < 0.3) continue
      if (px > OBC[0] - 0.45 * OBS - 0.03 && px < OBC[0] + 0.27 * OBS + 0.03 && pz > OBC[2] - 0.23 * OBS - 0.03 && pz < OBC[2] + 0.18 * OBS + 0.03) continue
      if (gs(px - TNP[0], pz - TNP[1], 0.25) > 0.42) continue
      const dj = Math.hypot(px - JKP[0], pz - JKP[1])
      if (dj < 0.17) continue
      if (dj < 0.26 && rv > 0.35) continue
      const u = ((px - FUN0[0]) * fdx + (pz - FUN0[1]) * fdz) / (fl * fl)
      const dd = Math.abs((px - FUN0[0]) * fdz - (pz - FUN0[1]) * fdx) / fl
      if (u > -0.05 && u < 1.05 && dd < 0.05) continue
      trees.push({ p: [px, heightAt(px, pz), pz], kind, sz })
    }
  }
}

/** 富士山（函南町から見た形）、海（駿河湾は西〜南西、相模湾は東）、伊豆の山並み（南）、雲の粒子 */
function buildDistant(density: number, scene: Pick<KannamiScene, 'fuji' | 'sea' | 'izu' | 'fujiClouds' | 'underClouds'>): void {
  const count = (n: number) => Math.round(n * density)
  {
    const r = seeded(17)
    for (let k = 0; k < count(5200); k++) {
      const v = Math.pow(r(), 1.25)
      const side = r() < 0.5 ? -1 : 1
      const w = fujiHalfWidth(v, side)
      const t = Math.pow(r(), 0.8)
      const u = side * t * w
      scene.fuji.push({ u, v, snow: v < fujiSnow(u), edge: t > 0.93, lit: side < 0 ? 1 : 0.72, tw: r() * TAU, sz: 0.8 + r() * 0.9 })
    }
    for (let k = 0; k < count(600); k++) {
      const v = r() * 0.85
      const side = r() < 0.5 ? -1 : 1
      const u = side * fujiHalfWidth(v, side)
      scene.fuji.push({ u, v, snow: v < fujiSnow(u), edge: true, lit: side < 0 ? 1 : 0.75, tw: r() * TAU, sz: 1.1 + r() * 0.6 })
    }
  }
  {
    const r = seeded(41)
    // 海：遠い地平線の細くきらめく帯（富士山と同じ距離）
    for (const [b0, b1, n] of [[205, 280, 2600], [70, 125, 1900]] as const) {
      for (let k = 0; k < count(n); k++) {
        const bd = b0 + r() * (b1 - b0)
        const t = Math.pow(r(), 1.6)
        const ends = Math.pow(Math.min(1, (bd - b0) / 20, (b1 - bd) / 20), 1.5)
        scene.sea.push({ b: bd * D2R, t, ends, tw: r() * TAU, sp: 0.8 + r() * 1.6, sz: 0.9 + r() * 1.1 })
      }
    }
    // 伊豆の山並み：南の地平線の低く重なる稜線（少し強調し、天城山を最も高くする）
    const ridgeH = (bd: number, L: number) => 0.45 + 0.16 * Math.sin(bd * 0.16 + L * 2) + 0.1 * Math.sin(bd * 0.4 + L) + 0.06 * Math.sin(bd * 1.0 + L * 3) + (L === 1 ? 0.45 * Math.exp(-Math.pow((bd - 186) / 8, 2)) : 0)
    for (const [L, n] of [[0, 1600], [1, 1900], [2, 1600]] as const) {
      for (let k = 0; k < count(n); k++) {
        const bd = 140 + r() * 85
        const t = Math.pow(r(), 0.45)
        const ends = Math.min(1, (bd - 140) / 14, (225 - bd) / 14)
        scene.izu.push({ b: bd * D2R, h: ridgeH(bd, L) * (0.75 + L * 0.2) * Math.min(1, ends * 1.5 + 0.2), t, ends, L, tw: r() * TAU, sz: 0.9 + r() * 1 })
      }
    }
  }
  {
    const r = seeded(29)
    for (let k = 0; k < count(1800); k++) scene.fujiClouds.push({ x: r(), y: r(), sp: 0.004 + r() * 0.006, a: r(), sz: 1.2 + r() * 1.8 })
    for (let k = 0; k < count(2200); k++) scene.underClouds.push({ x: r(), y: r(), sp: 0.006 + r() * 0.01, a: r(), sz: 1.2 + r() * 2 })
  }
}

const sceneCache = new Map<number, KannamiScene>()

/** 舞台を作る。同じ密度なら作り直さない */
export function kannamiScene(density: SceneDensity = { particles: 1 }): KannamiScene {
  const hit = sceneCache.get(density.particles)
  if (hit) return hit
  const scene: KannamiScene = { faces: [], lines: [], trees: [], azaleas: [], fuji: [], sea: [], izu: [], fujiClouds: [], underClouds: [], domes: [] }
  const b = createBuilder(scene.faces, scene.lines)
  buildTerrain(b)
  buildTownHall(b)
  buildHouses(b)
  buildObservatory(b, scene.domes)
  buildJukkoku(b, scene.azaleas)
  buildOratche(b)
  buildForest(scene.trees)
  buildDistant(density.particles, scene)
  sceneCache.set(density.particles, scene)
  return scene
}

let treeSpriteCache: HTMLCanvasElement[] | null = null

/** 木のスプライト3種（針葉樹・広葉樹・細い針葉樹） */
export function treeSprites(): HTMLCanvasElement[] {
  if (treeSpriteCache) return treeSpriteCache
  const fills = ['rgba(26,104,70,0.9)', 'rgba(34,122,74,0.9)', 'rgba(22,90,66,0.9)']
  const edges = ['rgba(130,255,190,0.95)', 'rgba(160,255,170,0.95)', 'rgba(110,235,200,0.95)']
  treeSpriteCache = [0, 1, 2].map((kind) => {
    const c = document.createElement('canvas')
    c.width = 40
    c.height = 56
    const x = c.getContext('2d')
    if (!x) throw new Error('Canvas 2D を使えない')
    x.fillStyle = fills[kind] ?? 'rgba(26,104,70,0.9)'
    x.strokeStyle = edges[kind] ?? 'rgba(130,255,190,0.95)'
    x.lineWidth = 1.6
    x.lineJoin = 'round'
    if (kind === 1) {
      x.beginPath()
      x.arc(20, 22, 14, 0, TAU)
      x.arc(11, 30, 9, 0, TAU)
      x.arc(29, 30, 9, 0, TAU)
      x.fill()
      x.beginPath()
      x.arc(20, 22, 14, Math.PI * 0.95, Math.PI * 2.05)
      x.stroke()
      x.beginPath()
      x.arc(11, 30, 9, Math.PI * 0.5, Math.PI * 1.3)
      x.stroke()
      x.beginPath()
      x.arc(29, 30, 9, -Math.PI * 0.3, Math.PI * 0.5)
      x.stroke()
      x.fillRect(18, 38, 4, 14)
    }
    else {
      const k = kind === 2 ? 0.8 : 1
      for (const t of [[20, 3, 14, 26], [20, 14, 17, 40], [20, 26, 19, 52]] as const) {
        x.beginPath()
        x.moveTo(t[0], t[1])
        x.lineTo(t[0] + t[2] * k, t[3])
        x.lineTo(t[0] - t[2] * k, t[3])
        x.closePath()
        x.fill()
        x.stroke()
      }
    }
    return c
  })
  return treeSpriteCache
}

let starCache: HTMLCanvasElement | null = null

/** 星空（UI モックの KnScene の値。オリジナル版の星より少し多く明るい） */
export function kannamiStars(): HTMLCanvasElement {
  if (starCache) return starCache
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 1024
  const x = c.getContext('2d')
  if (!x) throw new Error('Canvas 2D を使えない')
  const r = seeded(5)
  for (let k = 0; k < 760; k++) {
    x.fillStyle = `rgba(220,230,255,${0.15 + r() * 0.6})`
    x.beginPath()
    x.arc(r() * 1024, r() * 1024, 0.3 + r() * 0.9, 0, TAU)
    x.fill()
  }
  starCache = c
  return c
}
