// 描画エンジンの中核：カメラ・地球・日本の粒子・地方の熱・ラベル・投票の演出の管理。
// アルゴリズムと値は UI モック（JpScene）のもの。モックとの違いは docs/frontend-plan.md §3.2
//
// - 持続的な演出（集計状態から決まる）：setVisual で受け取った熱・にぎわいを滑らかに追いかける
// - 一時的な演出（投票ごと）：play で受け取った抽選結果を、衝動ごとのモードに渡す

import type { ImpulseKey } from '#shared/domain/impulse'
import type { RegionKey } from '#shared/domain/region'
import type { EffectChoice } from '../domain/effectLottery'
import type { ImpulseVisual } from '../domain/visualState'
import { glow as drawGlow, sprite, stars } from './draw'
import { ANCHORS, geography, ORIGIN, type Anchor, type LandParticle } from './geo'
import { clamp, D2R, easeOut, rnd, TAU, type RGB, type Vec3 } from './math'
import { createScheduler, trimEffects } from './scheduler'
import { createExodusMode } from './modes/exodus'
import { createFestivalMode } from './modes/festival'
import { createIkkiMode } from './modes/ikki'
import { subscribeFrame } from './ticker'

export interface Projected {
  x: number
  y: number
  s: number
  f: number
  vis: boolean
}

export interface Effect {
  t: number
  dur: number
  /** カメラの寄り（1 より大きいと寄る） */
  zoom?: number
  /** 一揆：群衆が一斉に腕を上げる */
  surge?: boolean
  /** レアの演出の主役（巨大な旗・「祭」の花火など）。上限を超えて間引くとき、最後まで残す */
  keep?: boolean
  draw(t: number): void
}

export interface ParticleMod {
  ox: number
  oy: number
  h: number
  a: number
  col?: string | null
}

/** レアの演出で、日本の粒子そのものを動かす */
export interface RareMod {
  dur: number
  mod(q: LandParticle, x: number, y: number, t: number, origin: Projected): ParticleMod | null
}

export interface AnchorState extends Anchor {
  /** 現在の熱（目標へ滑らかに近づく） */
  heat: number
  target: number
}

export interface Frame {
  W: number
  H: number
  /** 経過時間（秒） */
  T: number
  dt: number
  /** 地球の大きさに応じた倍率 */
  S: number
}

/** モードから使う描画の道具 */
export interface Stage {
  ctx: CanvasRenderingContext2D
  frame: Frame
  proj(v: Vec3, alt?: number): Projected
  accent: RGB
  accent2: RGB
  sprites: { accent: HTMLCanvasElement, accentSoft: HTMLCanvasElement, white: HTMLCanvasElement, cyan: HTMLCanvasElement }
  glow(s: HTMLCanvasElement, x: number, y: number, r: number, a: number): void
  /** 熱の大きい順 */
  anchors: AnchorState[]
  anchorOf(region: RegionKey): AnchorState
  /** にぎわい（0〜1、滑らかに追いかけた値） */
  activity(): number
  addEffect(e: Effect): void
  later(delay: number, fn: () => void): void
  setRare(mod: RareMod): void
  /** 人・提灯などの大きさの倍率 */
  f0(): number
  /** 投票の演出の起点（現在地の地方の代表都市。位置情報を使わないときは東京） */
  origin: Vec3
  /** 起点の地方。位置情報を使わないときは null */
  originRegion: RegionKey | null
}

export interface Mode {
  drawPersistent(): void
  normal: readonly (() => void)[]
  rare(): void
}

export interface EngineOptions {
  canvas: HTMLCanvasElement
  /** 画面全体の要素（大きさの基準） */
  root: HTMLElement
  /** 地球を描く範囲の要素 */
  stage: HTMLElement
  impulse: ImpulseKey
  /** 日本の粒子が集まってくる初回の演出をするか（端の複製ではしない） */
  intro: boolean
  reducedMotion: boolean
}

export interface Engine {
  setVisual(visual: ImpulseVisual): void
  /** 演出の起点を現在地の地方にする。null なら東京（docs/frontend-plan.md §2.2） */
  setOrigin(region: RegionKey | null): void
  play(choice: EffectChoice): void
  setReducedMotion(value: boolean): void
  destroy(): void
}

const ACCENTS: Record<ImpulseKey, [RGB, RGB]> = {
  ikki: [[255, 116, 82], [255, 200, 140]],
  exodus: [[108, 198, 255], [210, 240, 255]],
  festival: [[255, 197, 61], [255, 120, 170]],
}

/** 同時に描く演出の上限。連打しても重くならないよう、古いものから間引く。「◯秒後に実行」の予約は数えない（scheduler.ts） */
const MAX_EFFECTS = 28

/** 熱・にぎわいが目標へ近づく速さ（1秒あたり） */
const VISUAL_EASE_PER_SEC = 1.2

/** 地方の熱が日本の粒子に広がる範囲（度） */
const HEAT_SPREAD_DEG = 0.55

let heatWeightsCache: Float32Array | null = null

/** 粒子ごとの、各地方からの熱の受けやすさ。地形と同じく全画面で使い回す */
function heatWeights(land: readonly LandParticle[]): Float32Array {
  if (heatWeightsCache) return heatWeightsCache
  const w = new Float32Array(land.length * ANCHORS.length)
  land.forEach((q, i) => {
    ANCHORS.forEach((c, k) => {
      const dx = (q.lon - c.lon) * Math.cos(q.lat * D2R)
      const dy = q.lat - c.lat
      w[i * ANCHORS.length + k] = Math.exp(-(dx * dx + dy * dy) / (2 * HEAT_SPREAD_DEG * HEAT_SPREAD_DEG))
    })
  })
  heatWeightsCache = w
  return w
}

function devicePixelRatioCap(): number {
  // 低性能の端末では解像度を下げて、操作の滑らかさを優先する（USM §5「パフォーマンス」）
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  return Math.min(window.devicePixelRatio || 1, cores <= 4 ? 1.5 : 2)
}

export function createEngine(options: EngineOptions): Engine {
  const { canvas, root, stage: stageEl, impulse } = options
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D を使えない')
  const ctx: CanvasRenderingContext2D = context
  let reducedMotion = options.reducedMotion
  const intro = options.intro && !reducedMotion

  const geo = geography()
  const weights = heatWeights(geo.land)
  const landHeat = new Float32Array(geo.land.length)
  const [accent, accent2] = ACCENTS[impulse]
  const SA = sprite(accent)
  const SAs = sprite(accent, true)
  const SW = sprite([220, 235, 255])
  const SC = sprite([120, 200, 255])
  const STARS = stars()

  const anchors: AnchorState[] = ANCHORS.map(a => ({ ...a, heat: 0, target: 0 }))
  const anchorIndex = new Map(anchors.map(a => [a.region, a]))
  let labeled: RegionKey[] = []
  let activity = 0
  let activityTarget = 0

  const frame: Frame = { W: 1, H: 1, T: 0, dt: 0, S: 1 }
  let DPR = 1
  const cam = { lon0: 0, lat0: 0, phi: 0.58, F: 0.75, R: 1, cx: 0, cy: 0, cl: 1, sl: 0, ct: 1, st: 0, zoom: 1 }
  const effects: Effect[] = []
  const scheduler = createScheduler()
  const motes: { c: AnchorState, ox: number, oy: number, t: number, life: number, vy: number }[] = []
  let rare: { mod: RareMod, t0: number } | null = null
  let originProjected: Projected | null = null

  function proj(v: Vec3, alt = 0): Projected {
    const k = 1 + alt
    const x = v[0] * cam.cl - v[2] * cam.sl
    const z0 = v[2] * cam.cl + v[0] * cam.sl
    const y = v[1] * cam.ct - z0 * cam.st
    const z = v[1] * cam.st + z0 * cam.ct
    const X = x * k
    const Y = y * k
    const Z = z * k
    const cp = Math.cos(cam.phi)
    const sp = Math.sin(cam.phi)
    const y2 = Y * cp + (Z - 1) * sp
    const z2 = -Y * sp + (Z - 1) * cp
    const ny = y * cp + z * sp
    const nz = -y * sp + z * cp
    const facing = -x * X - ny * y2 + nz * (cam.F - z2)
    const s = cam.F / Math.max(0.05, cam.F - z2)
    return { x: cam.cx + cam.R * X * s, y: cam.cy - cam.R * y2 * s, s, f: facing, vis: facing > (alt > 0 ? -0.08 : 0) && z2 < cam.F * 0.95 }
  }

  const glow = (s: HTMLCanvasElement, x: number, y: number, r: number, a: number) => drawGlow(ctx, s, x, y, r, a)

  function addEffect(e: Effect): void {
    effects.push(e)
    trimEffects(effects, MAX_EFFECTS)
  }

  const stage: Stage = {
    ctx,
    frame,
    proj,
    accent,
    accent2,
    sprites: { accent: SA, accentSoft: SAs, white: SW, cyan: SC },
    glow,
    anchors,
    anchorOf(region) {
      const a = anchorIndex.get(region)
      if (!a) throw new Error(`地方がない：${region}`)
      return a
    },
    activity: () => activity,
    addEffect,
    later(delay, fn) {
      scheduler.schedule(frame.T, delay, fn)
    },
    setRare(mod) {
      rare = { mod, t0: frame.T }
    },
    f0: () => Math.max(0.7, frame.S * 1.5),
    origin: ORIGIN,
    originRegion: null,
  }

  const mode: Mode = impulse === 'ikki' ? createIkkiMode(stage) : impulse === 'exodus' ? createExodusMode(stage) : createFestivalMode(stage)

  /** 投票のたびに起点に出る波紋 */
  function ping(): void {
    addEffect({ t: 0, dur: 1.4, draw(t) {
      const p = proj(stage.origin)
      if (!p.vis) return
      const k = t / 1.4
      const f0 = stage.f0()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 1 - k
      ctx.strokeStyle = `rgb(${accent.join(',')})`
      ctx.lineWidth = 2
      ctx.beginPath()
      const r = (6 + 70 * easeOut(k)) * f0
      ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, TAU)
      ctx.stroke()
      glow(SA, p.x, p.y, 24 * f0 * (1 - k) + 4, 1 - k)
    } })
  }

  function resize(): void {
    frame.W = Math.max(1, root.offsetWidth)
    frame.H = Math.max(1, root.offsetHeight)
    DPR = devicePixelRatioCap()
    canvas.width = Math.round(frame.W * DPR)
    canvas.height = Math.round(frame.H * DPR)
  }

  function updateCamera(): void {
    const rb = root.getBoundingClientRect()
    const sc = rb.width / (root.offsetWidth || 1) || 1
    const st = stageEl.getBoundingClientRect()
    const sw = st.width / sc
    const sh = st.height / sc
    cam.cx = (st.left - rb.left) / sc + sw / 2
    cam.cy = (st.top - rb.top) / sc + sh * 0.56
    let zt = 1
    for (const e of effects) if (e.zoom && Math.abs(e.zoom - 1) > Math.abs(zt - 1)) zt = e.zoom
    cam.zoom += (zt - cam.zoom) * Math.min(1, frame.dt * 2)
    cam.R = Math.min(sh * 2.15, sw * 3.3) * cam.zoom
    // 動きを減らす設定のときは、カメラのゆっくりした揺れを止める
    const sway = reducedMotion ? 0 : 1
    cam.lon0 = (137.6 + Math.sin(frame.T * 0.07) * 0.8 * sway) * D2R
    cam.lat0 = (37.0 + Math.sin(frame.T * 0.05) * 0.4 * sway) * D2R
    cam.cl = Math.cos(cam.lon0)
    cam.sl = Math.sin(cam.lon0)
    cam.ct = Math.cos(cam.lat0)
    cam.st = Math.sin(cam.lat0)
    frame.S = cam.R / 1800
  }

  function easeVisual(): void {
    const k = Math.min(1, frame.dt * VISUAL_EASE_PER_SEC)
    activity += (activityTarget - activity) * k
    for (const a of anchors) a.heat += (a.target - a.heat) * k
    anchors.sort((a, b) => b.heat - a.heat)
    const n = ANCHORS.length
    const heatByAnchor = ANCHORS.map(a => anchorIndex.get(a.region)?.heat ?? 0)
    for (let i = 0; i < geo.land.length; i++) {
      let h = 0
      for (let k2 = 0; k2 < n; k2++) h += (weights[i * n + k2] ?? 0) * (heatByAnchor[k2] ?? 0)
      landHeat[i] = Math.min(1, h)
    }
  }

  function drawBackground(): void {
    const { W, H, T } = frame
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#000208')
    bg.addColorStop(0.5, '#020818')
    bg.addColorStop(1, '#03091a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.8
    const shift = reducedMotion ? 0 : (T * 3) % 1024
    ctx.drawImage(STARS, -shift, 0)
    ctx.drawImage(STARS, 1024 - shift, 0)
    ctx.drawImage(STARS, -shift, 1024)
  }

  /** 地球の縁と大気 */
  function drawHorizon(): void {
    ctx.globalCompositeOperation = 'lighter'
    const hz: Projected[] = []
    for (let b = -110; b <= 110; b += 2) {
      const th = b * D2R
      let lastP: Projected | null = null
      for (let a = 4; a <= 90; a += 1) {
        const al = a * D2R
        const lx = Math.sin(al) * Math.sin(th)
        const ly = Math.sin(al) * Math.cos(th)
        const lz = Math.cos(al)
        const z0 = -ly * cam.st + lz * cam.ct
        const y0 = ly * cam.ct + lz * cam.st
        const p = proj([lx * cam.cl + z0 * cam.sl, y0, z0 * cam.cl - lx * cam.sl])
        if (!p.vis) break
        lastP = p
      }
      if (lastP) hz.push(lastP)
    }
    if (hz.length <= 2) return
    const widths = [60, 28, 10, 1.5]
    const alphas = [0.05, 0.08, 0.14, 0.5]
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(${k < 2 ? '90,160,255' : accent.join(',')},${alphas[k]})`
      ctx.lineWidth = (widths[k] ?? 1) * Math.max(0.6, frame.S * 1.6)
      ctx.globalAlpha = 1
      ctx.lineJoin = 'round'
      ctx.beginPath()
      hz.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.stroke()
    }
  }

  function drawGlobeDots(): void {
    const { T } = frame
    ctx.fillStyle = 'rgb(120,170,255)'
    for (const v of geo.graticule) {
      const p = proj(v)
      if (!p.vis) continue
      ctx.globalAlpha = Math.min(1, p.f * 3) * 0.22
      const s = 0.9 * p.s
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
    }
    ctx.fillStyle = 'rgb(110,140,190)'
    for (const q of geo.context) {
      const p = proj(q.v)
      if (!p.vis) continue
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(T * 1.5 + q.tw)
      const s = 1.1 * p.s
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s)
    }
    // 熱い地方の下の光
    for (const c of anchors) {
      const p = proj(c.vec)
      if (!p.vis) continue
      glow(SAs, p.x, p.y, (40 + 120 * c.heat) * frame.S * p.s, 0.35 * c.heat * 2 + 0.08 * Math.sin(T * 2 + c.heat * 9))
    }
  }

  function drawLand(): void {
    const { W, H, T, S } = frame
    const asm = intro ? easeOut(clamp(T / 2.4, 0, 1)) : 1
    originProjected = proj(stage.origin)
    const rareT = rare ? T - rare.t0 : 0
    if (rare && rareT > rare.mod.dur) rare = null
    geo.land.forEach((q, i) => {
      const p = proj(q.v)
      if (!p.vis) return
      const k = clamp(asm * 1.25 - q.d0 * 0.25, 0, 1)
      let x = p.x + q.sx * (1 - k) * W * 0.4
      let y = p.y + q.sy * (1 - k) * H * 0.4
      const tw = 0.65 + 0.35 * Math.sin(T * (1.4 + q.d0 * 2) + q.tw)
      let h = landHeat[i] ?? 0
      let am = 1
      let mcol: string | null = null
      if (rare && originProjected) {
        const md = rare.mod.mod(q, x, y, rareT, originProjected)
        if (md) {
          x += md.ox
          y += md.oy
          h = Math.max(h, md.h)
          am = md.a
          mcol = md.col ?? null
        }
      }
      const r = Math.round(235 + (accent[0] - 235) * h * 0.85)
      const g = Math.round(242 + (accent[1] - 242) * h * 0.85)
      const b = Math.round(255 + (accent[2] - 255) * h * 0.85)
      ctx.fillStyle = mcol ?? `rgb(${r},${g},${b})`
      ctx.globalAlpha = Math.min(1, am * k * tw * (q.coast ? 0.95 : 0.55 + 0.4 * h))
      const s = q.sz * p.s * (1 + h * 0.6) * Math.max(0.7, S * 1.3)
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
      if ((q.coast && q.d0 < 0.05) || (h > 0.75 && q.d0 < 0.04)) glow(h > 0.5 ? SA : SW, x, y, s * 3.2, k * tw * 0.6)
    })
  }

  /** 熱い地方から立ち上る光の粒。にぎわいが大きいほど多い */
  function drawMotes(): void {
    const { dt, S } = frame
    if (!reducedMotion && Math.random() < dt * (6 + 24 * activity)) {
      const c = anchors[Math.min(anchors.length - 1, Math.floor(Math.random() * Math.random() * anchors.length))]
      if (c && c.heat > 0.2) motes.push({ c, ox: rnd(-30, 30), oy: rnd(-10, 10), t: 0, life: rnd(1.6, 3), vy: rnd(14, 34) })
    }
    for (let k = motes.length - 1; k >= 0; k--) {
      const m = motes[k]
      if (!m) continue
      m.t += dt
      if (m.t > m.life) {
        motes.splice(k, 1)
        continue
      }
      const p = proj(m.c.vec)
      if (!p.vis) continue
      const u = m.t / m.life
      glow(SA, p.x + m.ox * S * p.s * 1.6, p.y + m.oy * S - m.vy * m.t * Math.max(0.6, S * 1.5), 2.2, Math.sin(u * Math.PI) * 0.8)
    }
  }

  /** 熱い地方の照準と、上位の地方の英字ラベル（docs/frontend-plan.md Q-18：5つ、数値なし） */
  function drawLabels(): void {
    const { T, S } = frame
    ctx.globalCompositeOperation = 'source-over'
    labeled.forEach((region, i) => {
      const c = anchorIndex.get(region)
      if (!c) return
      const p = proj(c.vec)
      if (!p.vis) return
      const m = Math.max(0.7, S * 1.4)
      const r = (5 + c.heat * 6) * m * p.s
      ctx.globalAlpha = 0.75
      ctx.strokeStyle = `rgba(${accent.join(',')},0.9)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, T * 0.8 + i, T * 0.8 + i + 4.3)
      ctx.stroke()
      // 左右交互に、段をずらして重なりを避ける
      const side = i % 2 === 1 ? -1 : 1
      const lx = p.x + side * 46 * m
      const ly = p.y - (34 + 12 * Math.floor(i / 2)) * m
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = 'rgba(244,241,234,0.55)'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - r)
      ctx.lineTo(lx, ly)
      ctx.lineTo(lx + side * 26, ly)
      ctx.stroke()
      ctx.fillStyle = '#F4F1EA'
      ctx.font = '600 10px "Chakra Petch", sans-serif'
      ctx.textBaseline = 'bottom'
      ctx.textAlign = side < 0 ? 'right' : 'left'
      ctx.fillText(c.label, lx + side * 2, ly - 3)
      ctx.textAlign = 'left'
    })
  }

  function drawEffects(): void {
    scheduler.run(frame.T)
    for (let k = effects.length - 1; k >= 0; k--) {
      const e = effects[k]
      if (!e) continue
      e.t += frame.dt
      if (e.t > e.dur) {
        effects.splice(k, 1)
        continue
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      e.draw(e.t)
    }
  }

  function drawVignette(): void {
    const { W, H } = frame
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.8)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
  }

  let last = performance.now()

  function render(now: number): void {
    // 画面外（隣の衝動）にいる間は描かない。スワイプ中は隣も見えるので描く
    const vr = root.getBoundingClientRect()
    if (vr.width < 2 || vr.right <= 0 || vr.left >= (window.innerWidth || 1e9)) {
      last = now
      return
    }
    let dt = (now - last) / 1000
    last = now
    if (!(dt > 0)) dt = 0
    if (dt > 0.1) dt = 0.1
    frame.dt = dt
    frame.T += dt
    if (Math.abs(root.offsetWidth - frame.W) > 0.5 || Math.abs(root.offsetHeight - frame.H) > 0.5) resize()
    updateCamera()
    easeVisual()
    drawBackground()
    drawHorizon()
    drawGlobeDots()
    drawLand()
    drawMotes()
    mode.drawPersistent()
    drawLabels()
    drawEffects()
    drawVignette()
  }

  resize()
  const unsubscribe = subscribeFrame(render)

  return {
    setVisual(visual) {
      activityTarget = visual.activity
      for (const a of anchors) a.target = visual.heat[a.region]
      labeled = visual.labeled
    },
    setOrigin(region) {
      stage.originRegion = region
      stage.origin = region ? stage.anchorOf(region).vec : ORIGIN
    },
    play(choice) {
      ping()
      if (choice.kind === 'rare') mode.rare()
      else mode.normal[choice.index % mode.normal.length]?.()
    },
    setReducedMotion(value) {
      reducedMotion = value
    },
    destroy() {
      unsubscribe()
    },
  }
}
