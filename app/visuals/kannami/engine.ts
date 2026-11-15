// 函南町版の描画エンジン：ゆっくり周回するカメラ、ホログラムの舞台、感情の光、投票の演出。
// アルゴリズムと値は UI モック（docs/函南町_スマホ-html/KnScene.dc.html）のもの。モックとの違い：
//
// - 持続的な演出の強さ（感情の光の量・染まり具合）は、集計の寄与度から決めた「にぎわい」で決める
//   （モックは画面内で押した回数で強めていた。CLAUDE.md「持続的な状態は集計数だけから決める」）
// - 投票ごとの演出は衝動ごとに1種類。レア演出はない（docs/frontend-plan.md §5 K-2）
// - 舞台は全画面で使い回し、描画ループは全画面で1つ（ticker.ts）。表示中の画面だけを描く
// - 動きを減らす設定では、カメラの周回・揺れ・星の流れ・常時の光の粒を止める（投票の演出は残す）

import type { KannamiImpulseKey } from '#shared/domain/target'
import type { ImpulseVisual } from '../../domain/visualState'
import { glow as drawGlow, sprite } from '../draw'
import { clamp, easeOut, pick, rnd, TAU, type RGB, type Vec3 } from '../math'
import type { SceneEngine, SceneEngineOptions } from '../sceneEngine'
import { subscribeFrame } from '../ticker'
import {
  BASE_Y, createBuilder, cross3, dot3, fujiHalfWidth, funicularAt, FUN0, FUN1, heightAt, JKC, kannamiScene, kannamiStars, nrm,
  OBC, OBS, PASTURE, sub3, THC, THS, TNC, transform, treeSprites, type CloudParticle, type Face, type Line,
} from './geometry'

export interface KannamiEngineOptions extends SceneEngineOptions {
  impulse: KannamiImpulseKey
}

/** 衝動ごとの感情の光の色 */
interface Emotion {
  acc: RGB
  acc2: RGB
  /** 背景の星雲 */
  neb: RGB
  /** 台座の下からの光 */
  under: RGB
}

const EMOTIONS: Record<KannamiImpulseKey, Emotion> = {
  ikki: { acc: [255, 98, 56], acc2: [255, 196, 90], neb: [120, 26, 12], under: [255, 80, 30] },
  settle: { acc: [255, 196, 92], acc2: [255, 236, 170], neb: [96, 64, 16], under: [255, 180, 70] },
  pack: { acc: [140, 206, 255], acc2: [225, 245, 255], neb: [16, 50, 120], under: [110, 190, 255] },
}

/** にぎわいが目標へ近づく速さ（1秒あたり。オリジナル版と同じ） */
const VISUAL_EASE_PER_SEC = 1.2

/** 同時に描く投票の演出の上限。連打しても重くならないよう、古いものから間引く */
const MAX_EFFECTS = 24

/** 光の粒（火の粉・光の筋）と根の上限 */
const MAX_EMBERS = 700
const MAX_STREAMS = 500
const MAX_ROOTS = 900

/** 遠景（海・山並み）を置く距離。富士山と同じ */
const SCENERY_RADIUS = 2.2

interface Projected {
  x: number
  y: number
  z: number
  s: number
}

interface Ember {
  p: Vec3
  v: Vec3
  age: number
  life: number
  big?: boolean
}

interface Root {
  a: Vec3
  b: Vec3
  t0: number
  w: number
}

interface Stream {
  p: Vec3
  sp: number
  age: number
  life: number
  len: number
  big?: boolean
}

type PressEffect = { kind: 'bloom', t: number, dur: number, at: Vec3, ground: Vec3 } | { kind: 'beam', t: number, dur: number, at: Vec3 }

interface Cow {
  x: number
  z: number
  a: number
  t: number
  go: boolean
  sheep: boolean
}

type Visible
  = | { kind: 'face', z: number, pts: Projected[], f: Face, idx: number }
    | { kind: 'line', z: number, l: Line, idx: number, a: Projected, b: Projected }
    | { kind: 'tree', z: number, tree: number, q: Projected }
    | { kind: 'azalea', z: number, c: number, q: Projected }

function lowPower(): boolean {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  return cores <= 4
}

const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const rgba = (c: RGB, a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`

export function createKannamiEngine(options: KannamiEngineOptions): SceneEngine {
  const { canvas, root, stage: stageEl, impulse } = options
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D を使えない')
  const ctx: CanvasRenderingContext2D = context
  let reducedMotion = options.reducedMotion
  const intro0 = options.intro && !reducedMotion
  // 低性能の端末では、遠景の粒子を半分にし、解像度を下げる（USM §5「パフォーマンス」）
  const weak = lowPower()
  const scene = kannamiScene({ particles: weak ? 0.5 : 1 })
  const EMO = EMOTIONS[impulse]
  const ACC = EMO.acc

  // 静的な面・線の色は、染まり具合の段階が変わったときだけ作り直す（画面ごとに色が違うため、ここで持つ）
  const faceTint = new Int16Array(scene.faces.length).fill(-1)
  const faceFill: string[] = []
  const faceEdge: string[] = []
  const lineTint = new Int16Array(scene.lines.length).fill(-1)
  const lineStroke: string[] = []

  // 毎フレーム作り直す、動くもの（牛・羊・ケーブルカー）
  const dynFaces: Face[] = []
  const dynLines: Line[] = []
  const dyn = createBuilder(dynFaces, dynLines)

  const TREES = treeSprites()
  const STARS = kannamiStars()
  const SA = sprite(ACC)
  const SAs = sprite(ACC, true)
  const SA2 = sprite(EMO.acc2)
  const SU = sprite(EMO.under, true)
  const SW = sprite([225, 240, 255])
  const AZ0 = sprite([255, 80, 150])
  const AZ1 = sprite([255, 70, 70])
  const FUJI_GLOW = sprite([170, 200, 255], true)
  const LOOKOUT = sprite([255, 236, 190])
  const IKKI_UNDER = sprite([255, 90, 30], true)
  const SETTLE_UNDER = sprite([255, 200, 100], true)
  const PACK_UNDER = sprite([120, 190, 255], true)
  const glow = (s: HTMLCanvasElement, x: number, y: number, r: number, a: number) => drawGlow(ctx, s, x, y, r, a)

  let W = 1
  let H = 1
  let DPR = 1
  let T = 0
  let activity = 0
  let activityTarget = 0
  let flare = 0

  const cam = { yaw: 0.6, pitch: 0.6, D: 7, k: 300, cx: 0, cy: 0, pos: [0, 0, 0] as Vec3, r: [1, 0, 0] as Vec3, u: [0, 1, 0] as Vec3, f: [0, 0, 1] as Vec3, tgt: [0, 0.3, 0] as Vec3 }

  function setupCam(): void {
    const cp = Math.cos(cam.pitch)
    const sp = Math.sin(cam.pitch)
    cam.pos = [cam.tgt[0] + cam.D * cp * Math.sin(cam.yaw), cam.tgt[1] + cam.D * sp, cam.tgt[2] - cam.D * cp * Math.cos(cam.yaw)]
    cam.f = nrm(sub3(cam.tgt, cam.pos))
    cam.r = nrm(cross3([0, 1, 0], cam.f))
    cam.u = cross3(cam.f, cam.r)
  }

  function P(p: Vec3): Projected {
    const v: Vec3 = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]]
    const z = dot3(v, cam.f)
    const s = cam.k * cam.D / Math.max(0.05, z)
    return { x: cam.cx + dot3(v, cam.r) * s, y: cam.cy - dot3(v, cam.u) * s, z, s }
  }

  const COWS: Cow[] = Array.from({ length: 8 }, (_, i) => ({
    x: rnd(PASTURE.x0 + 0.03, PASTURE.x1 - 0.03),
    z: rnd(PASTURE.z0 + 0.03, PASTURE.z1 - 0.03),
    a: rnd(0, TAU),
    t: rnd(0, 4),
    go: false,
    sheep: i >= 6,
  }))

  // ================= 感情の光 =================
  const effects: PressEffect[] = []
  /** にぎわいから決まる光の強さ。票が0でも基本の光は残す（USM Activity 2） */
  const level = () => 0.35 + 0.65 * activity
  const tops = (): Vec3 => {
    const x = rnd(-0.95, 0.95)
    const z = rnd(-0.95, 0.95)
    return [x, heightAt(x, z) + 0.006, z]
  }
  // 一揆したい：台座から舞い上がる火の粉
  const embers: Ember[] = []
  // 骨を埋めたい：高台を這う金色の根
  const roots: Root[] = []
  // 荷物をまとめたい：台座から上へ流れ去る光
  const streams: Stream[] = []

  function growRoots(from: Vec3, n: number, gen: number): void {
    let p = from
    let ang = rnd(0, TAU)
    for (let i = 0; i < n; i++) {
      ang += rnd(-0.7, 0.7)
      const nx = clamp(p[0] + Math.cos(ang) * 0.06, -0.99, 0.99)
      const nz = clamp(p[2] + Math.sin(ang) * 0.06, -0.99, 0.99)
      const q: Vec3 = [nx, heightAt(nx, nz) + 0.006, nz]
      roots.push({ a: p, b: q, t0: T + i * 0.06 + gen, w: Math.max(0.6, 2 - i * 0.12) })
      if (Math.random() < 0.18 && n - i > 3) growRoots(q, Math.floor((n - i) * 0.6), gen + i * 0.06)
      p = q
    }
    if (roots.length > MAX_ROOTS) roots.splice(0, roots.length - MAX_ROOTS)
  }

  if (impulse === 'settle') {
    for (const c of [THC, OBC, JKC, TNC]) growRoots([c[0], c[1] + 0.006, c[2]], 12, -5)
    for (const r of roots) r.t0 = -10
  }

  /** 投票の演出の起点：名所（役場の円筒の上・天文台・十国峠・鐘楼・ドーム）か、地表のどこか */
  const ANCHORS: Vec3[] = [
    [THC[0], THC[1] + 0.34 * 1.16 * THS, THC[2] - 0.1 * THS],
    [OBC[0] - 0.08 * OBS, OBC[1] + 0.24 * OBS, OBC[2] - 0.1 * OBS],
    [JKC[0], JKC[1] + 0.08, JKC[2]],
    [TNC[0] + 0.05, TNC[1] + 0.26, TNC[2] + 0.045],
    [OBC[0] + 0.2 * OBS, OBC[1] + 0.3 * OBS, OBC[2] + 0.11 * OBS],
  ]

  function pushEffect(effect: PressEffect): void {
    effects.push(effect)
    if (effects.length > MAX_EFFECTS) effects.splice(0, effects.length - MAX_EFFECTS)
  }

  function vote(): void {
    flare = 1
    const at = Math.random() < 0.45 ? pick(ANCHORS) : tops()
    const ground: Vec3 = [at[0], heightAt(at[0], at[2]) + 0.004, at[2]]
    pushEffect({ kind: 'bloom', t: 0, dur: 2.2, at, ground })
    if (impulse === 'ikki') {
      for (let i = 0; i < 70; i++) embers.push({ p: [at[0] + rnd(-0.05, 0.05), at[1], at[2] + rnd(-0.05, 0.05)], v: [rnd(-0.12, 0.12), rnd(0.25, 0.7), rnd(-0.12, 0.12)], age: 0, life: rnd(1.2, 2.4), big: true })
      if (embers.length > MAX_EMBERS) embers.splice(0, embers.length - MAX_EMBERS)
    }
    if (impulse === 'settle') {
      for (let k = 0; k < 3; k++) growRoots(ground, 12 + Math.floor(Math.random() * 8), 0)
    }
    if (impulse === 'pack') {
      pushEffect({ kind: 'beam', t: 0, dur: 3, at })
      for (let i = 0; i < 40; i++) streams.push({ p: [at[0] + rnd(-0.06, 0.06), at[1] + rnd(0, 0.1), at[2] + rnd(-0.06, 0.06)], sp: rnd(0.6, 1.3), age: 0, life: rnd(1.5, 2.6), len: rnd(0.08, 0.2), big: true })
      if (streams.length > MAX_STREAMS) streams.splice(0, streams.length - MAX_STREAMS)
    }
  }

  // ================= 描画 =================
  function resize(): void {
    W = Math.max(1, root.offsetWidth)
    H = Math.max(1, root.offsetHeight)
    DPR = Math.min(window.devicePixelRatio || 1, weak ? 1.25 : 1.5)
    canvas.width = Math.round(W * DPR)
    canvas.height = Math.round(H * DPR)
  }

  function scenePoint(b: number): Projected {
    return P([Math.sin(b) * SCENERY_RADIUS, 0, Math.cos(b) * SCENERY_RADIUS])
  }

  /** 遠景：海のきらめきと伊豆の山並み（実際の方位に固定） */
  function drawScenery(cc: Projected, intro: number, top: number, sh: number): void {
    const yTop = Math.max(6, top - sh * 0.02)
    const yBase = cam.cy + cam.k * 0.6
    const Hf = yBase - yTop
    const yH = yTop + Hf * 0.72
    const sk = Math.max(1, cam.k / 220)
    ctx.globalCompositeOperation = 'lighter'
    for (const q of scene.sea) {
      const p = scenePoint(q.b)
      const fa = clamp((p.z - cc.z) / 1.3, 0, 1) * q.ends * intro
      if (fa < 0.02) continue
      const sh2 = 0.5 + 0.5 * Math.sin(T * q.sp + q.tw + q.b * 40)
      const y = yH + q.t * Hf * 0.09
      let a = (0.1 + 0.45 * Math.pow(sh2, 3)) * (1 - q.t * 0.5)
      if (q.t < 0.015) a = 0.45
      ctx.globalAlpha = a * fa
      ctx.fillStyle = q.t < 0.02 ? '#D2E8FF' : (sh2 > 0.85 ? '#D8F0FF' : '#6FAEF0')
      const sz = q.sz * sk * 0.85
      const gl = sz * (1.2 + 2.2 * sh2)
      ctx.fillRect(p.x - gl / 2, y - sz * 0.3, gl, sz * 0.6)
    }
    for (const q of scene.izu) {
      const p = scenePoint(q.b)
      const fa = clamp((p.z - cc.z) / 1.3, 0, 1) * q.ends * intro
      if (fa < 0.02) continue
      const crest = q.t > 0.94
      const y = yH - q.h * Hf * 0.28 * q.t
      ctx.globalAlpha = (crest ? 1 : 0.18 + 0.55 * q.t * q.t) * (1 - q.L * 0.25) * fa * (0.75 + 0.25 * Math.sin(T * 1.3 + q.tw))
      ctx.fillStyle = crest ? '#DCE6FA' : '#8CA3D6'
      const sz = q.sz * sk
      ctx.fillRect(p.x - sz / 2, y - sz / 2, sz, sz)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  function cloudBand(list: readonly CloudParticle[], cx: number, cy: number, wid: number, hgt: number, alpha: number, col: string): void {
    ctx.fillStyle = col
    for (const c of list) {
      const xx = (c.x + T * c.sp) % 1
      const yy = c.y
      const lump = 0.55 + 0.45 * Math.sin(xx * 19 + c.y * 7) * Math.sin(xx * 7 - c.y * 3)
      const d = Math.abs(yy - 0.5) * 2
      if (d > lump) continue
      const a = alpha * (1 - d / Math.max(0.05, lump)) * (0.5 + 0.5 * Math.sin(T * 1.2 + c.a * 9)) * Math.sin(xx * Math.PI)
      if (a < 0.02) continue
      ctx.globalAlpha = a
      const sz = c.sz * Math.max(1, cam.k / 200)
      ctx.fillRect(cx + (xx - 0.5) * wid - sz / 2, cy + (yy - 0.5) * hgt - sz / 2, sz, sz)
    }
  }

  /** 牧場の牛・羊と、すれ違う2両のケーブルカー */
  function buildDynamic(dt: number): void {
    dynFaces.length = 0
    dynLines.length = 0
    for (const c of COWS) {
      if (!reducedMotion) {
        c.t -= dt
        if (c.t <= 0) {
          c.t = rnd(2, 5)
          c.a += rnd(-1.4, 1.4)
          c.go = Math.random() < 0.5
        }
        if (c.go) {
          const nx = c.x + Math.cos(c.a) * 0.012 * dt
          const nz = c.z + Math.sin(c.a) * 0.012 * dt
          if (nx > PASTURE.x0 + 0.02 && nx < PASTURE.x1 - 0.02 && nz > PASTURE.z0 + 0.02 && nz < PASTURE.z1 - 0.02) {
            c.x = nx
            c.z = nz
          }
          else c.a += Math.PI
        }
      }
      const f = transform(c.x, heightAt(c.x, c.z), c.z, -c.a, c.sheep ? 0.8 : 1.25)
      if (c.sheep) {
        dyn.box(f, -0.016, 0.008, -0.009, 0.016, 0.026, 0.009, [240, 232, 214], { a: 0.85, ea: 0.9 })
        dyn.box(f, 0.016, 0.014, -0.005, 0.026, 0.026, 0.005, [70, 62, 58], { a: 0.85, ea: 0.9 })
      }
      else {
        dyn.box(f, -0.02, 0.01, -0.01, 0.02, 0.028, 0.01, [244, 242, 236], { a: 0.85, ea: 0.9 }, { top: [40, 40, 46] })
        dyn.box(f, -0.008, 0.012, -0.0102, 0.006, 0.026, 0.0102, [40, 40, 46], { a: 0.85, ea: 0.6 })
        dyn.box(f, 0.02, 0.016, -0.006, 0.032, 0.028, 0.006, [244, 242, 236], { a: 0.85, ea: 0.9 })
        dyn.box(f, -0.016, 0, -0.008, -0.012, 0.01, 0.008, [60, 56, 54], { a: 0.8, ea: 0.5 })
        dyn.box(f, 0.012, 0, -0.008, 0.016, 0.01, 0.008, [60, 56, 54], { a: 0.8, ea: 0.5 })
      }
    }
    const fu = 0.5 + 0.5 * Math.sin(T * 0.3)
    const ang = Math.atan2(FUN1[2] - FUN0[1], FUN1[0] - FUN0[0])
    const dxn = -(FUN1[2] - FUN0[1])
    const dzn = FUN1[0] - FUN0[0]
    const ln = Math.hypot(dxn, dzn)
    for (const [u, side] of [[fu, 1], [1 - fu, -1]] as const) {
      const p = funicularAt(u)
      const off = 0.013 * Math.max(0, 1 - Math.abs(u - 0.5) / 0.12) * side
      const f = transform(p[0] + dxn / ln * off, p[1], p[2] + dzn / ln * off, -ang, 1)
      dyn.box(f, -0.03, 0.004, -0.011, 0.03, 0.02, 0.011, [70, 150, 220], { a: 0.85, ea: 0.95, glow: 0.4 })
      dyn.box(f, -0.03, 0.02, -0.011, 0.03, 0.036, 0.011, [236, 242, 250], { a: 0.7, ea: 0.95, glow: 0.6 }, { top: [70, 150, 220] })
    }
  }

  function drawFace(v: Extract<Visible, { kind: 'face' }>, tintK: number, tb: number, intro: number, shimmer: number): void {
    const f = v.f
    ctx.beginPath()
    v.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
    ctx.closePath()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = intro
    let fill: string
    let edge: string
    const cached = v.idx >= 0 && faceTint[v.idx] === tb
    if (cached) {
      fill = faceFill[v.idx] ?? ''
      edge = faceEdge[v.idx] ?? ''
    }
    else {
      fill = rgba(mixc(f.rgb, ACC, tintK * (f.tier ? 0.45 : 0.25)), f.a)
      edge = rgba(mixc(f.edge, ACC, tintK * (f.tier ? 0.8 : 0.45)), 1)
      if (v.idx >= 0) {
        faceTint[v.idx] = tb
        faceFill[v.idx] = fill
        faceEdge[v.idx] = edge
      }
    }
    ctx.fillStyle = fill
    ctx.fill()
    if (f.ea < 0.2) {
      ctx.strokeStyle = fill
      ctx.lineWidth = 0.6
      ctx.stroke()
      return
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = f.ea * intro * shimmer
    ctx.strokeStyle = edge
    ctx.lineWidth = f.tier ? 1.2 : 1
    ctx.stroke()
    if (f.glow) {
      ctx.globalAlpha = f.glow * 0.15 * intro
      ctx.fillStyle = 'rgba(200,235,255,1)'
      ctx.fill()
    }
  }

  function drawLine(v: Extract<Visible, { kind: 'line' }>, tintK: number, tb: number, intro: number, shimmer: number): void {
    const l = v.l
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = l.a0 * intro * shimmer
    let stroke: string
    if (v.idx >= 0 && lineTint[v.idx] === tb) stroke = lineStroke[v.idx] ?? ''
    else {
      stroke = rgba(mixc(l.col, ACC, tintK * 0.6 + l.glow * 0.1), 1)
      if (v.idx >= 0) {
        lineTint[v.idx] = tb
        lineStroke[v.idx] = stroke
      }
    }
    ctx.strokeStyle = stroke
    ctx.lineWidth = l.w
    ctx.beginPath()
    ctx.moveTo(v.a.x, v.a.y)
    ctx.lineTo(v.b.x, v.b.y)
    ctx.stroke()
  }

  /** 富士山：北西の遠くに大きく。淡い影絵の上に粒子、裾に流れる雲 */
  function drawFuji(intro: number, top: number, sh: number): void {
    const fc = P([-1.56, 0, 1.56])
    const cc = P([0, 0, 0])
    const fa = clamp((fc.z - cc.z) / 1.3, 0, 1) * intro
    if (fa <= 0.01) return
    const yTop = Math.max(6, top - sh * 0.02)
    const yBase = cam.cy + cam.k * 0.6
    const Hf = yBase - yTop
    const Wb = Hf * 1.9
    const fx = fc.x
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = fa
    const g1 = ctx.createLinearGradient(0, yTop, 0, yBase)
    g1.addColorStop(0, 'rgba(110,140,205,0.2)')
    g1.addColorStop(0.5, 'rgba(80,108,175,0.12)')
    g1.addColorStop(1, 'rgba(60,84,150,0)')
    ctx.beginPath()
    for (let k = 50; k >= 0; k--) {
      const v = k / 50
      ctx.lineTo(fx - fujiHalfWidth(v, -1) * Wb, yTop + v * Hf)
    }
    for (let k = 0; k <= 50; k++) {
      const v = k / 50
      ctx.lineTo(fx + fujiHalfWidth(v, 1) * Wb, yTop + v * Hf)
    }
    ctx.closePath()
    ctx.fillStyle = g1
    ctx.fill()
    for (const q of scene.fuji) {
      const x = fx + q.u * Wb
      const y = yTop + q.v * Hf
      const fade = 1 - Math.pow(q.v, 2.2)
      let a = (q.snow ? 0.95 : 0.22) * q.lit * fade * (0.7 + 0.3 * Math.sin(T * 1.4 + q.tw))
      if (q.edge) a = Math.min(1, a * 1.6 + 0.15 * fade)
      if (a < 0.02) continue
      ctx.globalAlpha = a * fa
      ctx.fillStyle = q.snow ? '#EEF4FF' : (q.edge ? '#B9CCF2' : '#8EA6DA')
      const sz = q.sz * (q.snow ? 1.15 : 1)
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz)
    }
    ctx.globalCompositeOperation = 'lighter'
    glow(FUJI_GLOW, fx, yTop + Hf * 0.1, Hf * 0.45, 0.16 * fa)
    cloudBand(scene.fujiClouds, fx, yTop + Hf * 0.42, Math.min(Wb * 1.7, W * 1.1), Hf * 0.14, 0.75 * fa, '#D6E2F8')
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  /** 常時の感情の光（強さは glowK。にぎわいから決まる） */
  function drawEmotion(dt: number, glowK: number, intro: number): void {
    const ambient = !reducedMotion
    if (impulse === 'ikki') {
      // 下から照らす火と、舞い上がる火の粉
      if (ambient && Math.random() < 18 * glowK * dt * 3) {
        for (let i = 0; i < 2; i++) embers.push({ p: tops(), v: [rnd(-0.05, 0.05), rnd(0.15, 0.4), rnd(-0.05, 0.05)], age: 0, life: rnd(1.5, 3) })
      }
      const und = P([0, BASE_Y - 0.05, 0])
      glow(IKKI_UNDER, und.x, und.y, cam.k * 1.4, 0.45 * glowK * (ambient ? 0.8 + 0.2 * Math.sin(T * 13) : 1))
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]
        if (!e) continue
        e.age += dt
        if (e.age > e.life) {
          embers.splice(i, 1)
          continue
        }
        e.p = [e.p[0] + e.v[0] * dt + Math.sin(T * 3 + i) * 0.002, e.p[1] + e.v[1] * dt, e.p[2] + e.v[2] * dt]
        const q = P(e.p)
        const k = e.age / e.life
        glow(k < 0.4 ? SA2 : SA, q.x, q.y, (e.big ? 3.2 : 2.4) * (1 - k * 0.5), (1 - k) * (0.6 + 0.4 * Math.sin(T * 20 + i)))
      }
    }
    else if (impulse === 'settle') {
      // 高台の金色の根と、根を伝わる脈
      for (let i = 0; i < roots.length; i++) {
        const r = roots[i]
        if (!r) continue
        const k = clamp((T - r.t0) / 0.25, 0, 1)
        if (k <= 0) continue
        const a = P(r.a)
        const b0 = P(r.b)
        const b = { x: a.x + (b0.x - a.x) * k, y: a.y + (b0.y - a.y) * k }
        const pulse = ambient ? 0.55 + 0.45 * Math.sin(T * 2.2 - i * 0.15) : 0.8
        ctx.globalAlpha = Math.min(1, (0.35 + 0.5 * glowK) * pulse * intro)
        ctx.strokeStyle = rgba(EMO.acc, 1)
        ctx.lineWidth = r.w * Math.max(0.8, cam.k / 360)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        if (i % 7 === 0) glow(SAs, b.x, b.y, 6 + 6 * glowK, 0.35 * pulse)
      }
      if (ambient && Math.random() < dt * 14 * glowK) embers.push({ p: tops(), v: [rnd(-0.02, 0.02), rnd(0.05, 0.12), rnd(-0.02, 0.02)], age: 0, life: rnd(2, 3.5) })
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]
        if (!e) continue
        e.age += dt
        if (e.age > e.life) {
          embers.splice(i, 1)
          continue
        }
        e.p = [e.p[0] + e.v[0] * dt, e.p[1] + e.v[1] * dt, e.p[2] + e.v[2] * dt]
        const q = P(e.p)
        glow(SA2, q.x, q.y, 2.6, Math.sin(e.age / e.life * Math.PI) * 0.8)
      }
      const und = P([0, 0.2, 0])
      glow(SETTLE_UNDER, und.x, und.y, cam.k * 1.5, 0.22 * glowK)
    }
    else {
      // 上へ流れ去る冷たい光
      if (ambient && Math.random() < dt * 22 * glowK) {
        for (let i = 0; i < 2; i++) streams.push({ p: tops(), sp: rnd(0.35, 0.8), age: 0, life: rnd(2, 3.5), len: rnd(0.06, 0.16) })
      }
      for (let i = streams.length - 1; i >= 0; i--) {
        const s = streams[i]
        if (!s) continue
        s.age += dt
        if (s.age > s.life) {
          streams.splice(i, 1)
          continue
        }
        s.p = [s.p[0], s.p[1] + s.sp * dt * (1 + s.age), s.p[2]]
        const a = P(s.p)
        const b = P([s.p[0], s.p[1] - s.len * (1 + s.age), s.p[2]])
        const k = s.age / s.life
        const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        gr.addColorStop(0, rgba(EMO.acc2, (1 - k) * 0.9))
        gr.addColorStop(1, rgba(EMO.acc, 0))
        ctx.globalAlpha = 1
        ctx.strokeStyle = gr
        ctx.lineWidth = s.big ? 2.2 : 1.4
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        glow(SA, a.x, a.y, 2.5, (1 - k) * 0.8)
      }
      const und = P([0, 0.3, 0])
      glow(PACK_UNDER, und.x, und.y - cam.k * 0.4, cam.k * 1.3, 0.22 * glowK)
    }
  }

  /** 投票の演出：押した場所の光と広がる輪、荷物をまとめたいは空への光の柱 */
  function drawPressEffects(dt: number): void {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]
      if (!e) continue
      e.t += dt
      if (e.t > e.dur) {
        effects.splice(i, 1)
        continue
      }
      const k = e.t / e.dur
      if (e.kind === 'bloom') {
        const p = P(e.at)
        glow(SA, p.x, p.y, (0.12 + 0.25 * easeOut(Math.min(1, e.t * 3))) * p.s * (1 - k), 1 - k)
        glow(SAs, p.x, p.y, 0.55 * p.s * easeOut(k), (1 - k) * 0.7)
        const gy = e.ground[1]
        const R = 0.04 + 0.36 * easeOut(k)
        ctx.globalAlpha = (1 - k) * 0.9
        ctx.strokeStyle = rgba(EMO.acc2, 1)
        ctx.lineWidth = 2
        ctx.beginPath()
        for (let j = 0; j <= 40; j++) {
          const a = j / 40 * TAU
          const q = P([e.ground[0] + Math.cos(a) * R, gy, e.ground[2] + Math.sin(a) * R])
          if (j) ctx.lineTo(q.x, q.y)
          else ctx.moveTo(q.x, q.y)
        }
        ctx.stroke()
      }
      else {
        const a = P(e.at)
        const b = P([e.at[0], e.at[1] + 3, e.at[2]])
        const w = (1 - k) * 0.05 * a.s + 2
        const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        gr.addColorStop(0, rgba(EMO.acc2, (1 - k) * 0.9))
        gr.addColorStop(1, rgba(EMO.acc, 0))
        ctx.globalAlpha = 1
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.moveTo(a.x - w, a.y)
        ctx.lineTo(a.x + w, a.y)
        ctx.lineTo(b.x + w * 0.2, b.y)
        ctx.lineTo(b.x - w * 0.2, b.y)
        ctx.closePath()
        ctx.fill()
      }
    }
  }

  let last = performance.now()

  function render(now: number): void {
    // 画面外（隣の衝動・非表示のモード）にいる間は描かない。スワイプ中は隣も見えるので描く
    const vr = root.getBoundingClientRect()
    if (vr.width < 2 || vr.right <= 0 || vr.left >= (window.innerWidth || 1e9)) {
      last = now
      return
    }
    let dt = (now - last) / 1000
    last = now
    if (!(dt > 0)) dt = 0
    if (dt > 0.1) dt = 0.1
    T += dt
    if (Math.abs(root.offsetWidth - W) > 0.5 || Math.abs(root.offsetHeight - H) > 0.5) resize()
    const sc = vr.width / (root.offsetWidth || 1) || 1
    const st = stageEl.getBoundingClientRect()
    const sw = st.width / sc
    const sh = st.height / sc
    const top = (st.top - vr.top) / sc
    const intro = intro0 ? easeOut(clamp(T / 2.4, 0, 1)) : 1
    activity += (activityTarget - activity) * Math.min(1, dt * VISUAL_EASE_PER_SEC)
    const LV = level()
    flare = Math.max(0, flare - dt * 0.8)
    const flicker = impulse === 'ikki' && !reducedMotion ? 0.85 + 0.15 * Math.sin(T * 9) * Math.sin(T * 5.3) : 1
    const glowK = LV * flicker + flare * 0.5
    const motion = reducedMotion ? 0 : 1

    cam.k = Math.min(sw * 0.36, sh * 0.44)
    cam.cx = (st.left - vr.left) / sc + sw / 2
    cam.cy = top + sh * 0.55 + Math.sin(T * 0.8) * 4 * motion + (1 - intro) * sh * 0.3
    cam.yaw = 0.6 + T * 0.1 * motion
    cam.pitch = 0.6
    setupCam()

    // 宇宙の背景
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#000208')
    bg.addColorStop(0.6, '#020818')
    bg.addColorStop(1, '#03091a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.8
    for (let x = -((T * 3 * motion) % 1024); x < W; x += 1024) {
      for (let y = 0; y < H; y += 1024) ctx.drawImage(STARS, x, y)
    }
    const neb = ctx.createRadialGradient(cam.cx, cam.cy, cam.k * 0.3, cam.cx, cam.cy, cam.k * 2.6)
    neb.addColorStop(0, rgba(EMO.neb, 0.35 + 0.25 * glowK))
    neb.addColorStop(1, rgba(EMO.neb, 0))
    ctx.globalAlpha = 1
    ctx.fillStyle = neb
    ctx.fillRect(0, 0, W, H)

    // 投影機の円盤と下からの光
    ctx.globalCompositeOperation = 'lighter'
    const pc = P([0, -0.6, 0])
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = (0.35 - k * 0.07) * intro
      ctx.strokeStyle = rgba(EMO.under, 1)
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= 48; i++) {
        const a = i / 48 * TAU
        const q = P([Math.cos(a) * (0.5 + k * 0.32), -0.6, Math.sin(a) * (0.5 + k * 0.32)])
        if (i) ctx.lineTo(q.x, q.y)
        else ctx.moveTo(q.x, q.y)
      }
      ctx.stroke()
    }
    glow(SU, pc.x, pc.y - cam.k * 0.3, cam.k * 1.5, (0.35 + 0.45 * glowK) * intro)
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const a = P([x * 0.5, -0.6, z * 0.5])
      const b = P([x, BASE_Y, z])
      const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
      gr.addColorStop(0, rgba(EMO.under, 0.35 * intro))
      gr.addColorStop(1, rgba(EMO.under, 0))
      ctx.globalAlpha = 1
      ctx.strokeStyle = gr
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'

    drawScenery(P([0, 0, 0]), intro, top, sh)
    drawFuji(intro, top, sh)
    // 台座の下を流れる雲の粒子
    ctx.globalCompositeOperation = 'lighter'
    cloudBand(scene.underClouds, cam.cx, cam.cy + cam.k * 0.72, Math.min(cam.k * 3.4, W * 1.1), cam.k * 0.4, 0.65 * intro, '#C2D2F2')
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    buildDynamic(dt)

    // ホログラムの面と線、木、つつじを奥から手前へ
    const vis: Visible[] = []
    const addFace = (f: Face, idx: number) => {
      if (dot3(f.n, sub3(cam.pos, f.ctr)) <= 0) return
      const pts = f.p.map(P)
      let z = 0
      for (const q of pts) z += q.z
      vis.push({ kind: 'face', z: z / pts.length, pts, f, idx })
    }
    scene.faces.forEach(addFace)
    for (const f of dynFaces) addFace(f, -1)
    const addLine = (l: Line, idx: number) => {
      if (l.n && dot3(l.n, sub3(cam.pos, l.a)) <= 0) return
      const a = P(l.a)
      const b = P(l.b)
      vis.push({ kind: 'line', z: (a.z + b.z) / 2 - 0.02, l, idx, a, b })
    }
    scene.lines.forEach(addLine)
    for (const l of dynLines) addLine(l, -1)
    scene.trees.forEach((t, index) => {
      const q = P(t.p)
      vis.push({ kind: 'tree', z: q.z - 0.01, tree: index, q })
    })
    for (const t of scene.azaleas) {
      const q = P(t.p)
      vis.push({ kind: 'azalea', z: q.z - 0.012, c: t.c, q })
    }
    vis.sort((a, b) => b.z - a.z)
    const tintK = Math.round(clamp(0.15 + 0.35 * glowK, 0, 0.7) * 16) / 16
    const tb = Math.round(tintK * 16)
    const shimmer = reducedMotion ? 0.96 : 0.92 + 0.08 * Math.sin(T * 30)
    for (const v of vis) {
      if (v.kind === 'tree') {
        const tree = scene.trees[v.tree]
        const img = tree ? TREES[tree.kind] : undefined
        if (!tree || !img) continue
        const h = 0.085 * tree.sz * v.q.s
        const w = h * 0.72
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.95 * intro
        ctx.drawImage(img, v.q.x - w / 2, v.q.y - h * 0.96, w, h)
      }
      else if (v.kind === 'azalea') {
        ctx.globalCompositeOperation = 'lighter'
        glow(v.c ? AZ1 : AZ0, v.q.x, v.q.y, 0.016 * v.q.s, 0.9 * intro)
      }
      else if (v.kind === 'line') drawLine(v, tintK, tb, intro, shimmer)
      else drawFace(v, tintK, tb, intro, shimmer)
    }
    ctx.globalCompositeOperation = 'lighter'

    // 名所の光（ガラスの円筒、ドームのスリット、展望台の灯り）
    const cylTop = P([THC[0], THC[1] + 0.34 * 1.14 * THS, THC[2] - 0.1 * THS])
    glow(SW, cylTop.x, cylTop.y, 0.12 * cylTop.s, 0.35 * intro)
    for (const d of scene.domes) {
      const c = P(d.c)
      const R = d.r * c.s
      const a = T * 0.3 * motion + d.ph
      if (Math.cos(a) < -0.1) continue
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.8 * intro
      ctx.strokeStyle = '#1a2030'
      ctx.lineWidth = Math.max(1.2, R * 0.25)
      ctx.beginPath()
      ctx.moveTo(c.x + Math.sin(a) * R * 0.95, c.y - R * 0.1)
      ctx.quadraticCurveTo(c.x + Math.sin(a) * R * 0.7, c.y - R, c.x, c.y - R)
      ctx.stroke()
      if (d.tube) {
        ctx.strokeStyle = 'rgba(230,236,245,0.9)'
        ctx.lineWidth = Math.max(1, R * 0.18)
        ctx.beginPath()
        ctx.moveTo(c.x + Math.sin(a) * R * 0.4, c.y - R * 0.7)
        ctx.lineTo(c.x + Math.sin(a) * R * 1.3, c.y - R * 1.35)
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'lighter'
    }
    const lk = P([JKC[0] - 0.018, JKC[1] + 0.035, JKC[2] - 0.01])
    glow(LOOKOUT, lk.x, lk.y, 0.09 * lk.s, 0.4 * intro)

    drawEmotion(dt, glowK, intro)
    drawPressEffects(dt)

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.8)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.5)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
  }

  resize()
  const unsubscribe = subscribeFrame(render)

  return {
    setVisual(visual: ImpulseVisual) {
      activityTarget = visual.activity
    },
    play() {
      vote()
    },
    setReducedMotion(value: boolean) {
      reducedMotion = value
    },
    destroy() {
      unsubscribe()
    },
  }
}
