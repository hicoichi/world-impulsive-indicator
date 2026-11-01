// 祭りたい：提灯、踊りの輪、花火（UI モック JpScene の drawMatsuri と ma* の演出）

import { sprite } from '../draw'
import { clamp, hexRGB, pick, rnd, seeded, TAU, type Vec3 } from '../math'
import type { AnchorState, Mode, Stage } from '../stage'
import { hasVotes, pickByHeat } from './common'

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  c: string
  life: number
  age: number
}

interface Firework {
  parts: Spark[]
  t: number
  x: number
  y: number
  big: number
  flash: string
  grav: number
}

const PALETTES: readonly [string, string][] = [['#FF4F8B', '#FFD1E3'], ['#FFC94D', '#FFF3C4'], ['#7CE8FF', '#E6FBFF'], ['#B57BFF', '#F0E2FF'], ['#FF6B3D', '#FFE0A8'], ['#FFFFFF', '#FFE7A8']]

/** 1地方あたりの提灯の列の最大数（UI モック：2 + 熱 × 6） */
const MAX_STRINGS = 8

/** 同時に上がっている花火の上限。連打しても重くならないよう、古いものから消す */
const MAX_FIREWORKS = 40

export function createFestivalMode(stage: Stage): Mode {
  const { ctx, frame, proj, sprites } = stage
  const r2 = seeded(99)
  const fireworks: Firework[] = []
  let wave: { t0: number } | null = null
  const ringSprite = sprite(stage.accent2)

  const strings = new Map(stage.anchors.map(c => [c.region, Array.from({ length: MAX_STRINGS }, (_, k) => ({
    ox: (r2() - 0.5) * 50 * (0.5 + k / MAX_STRINGS),
    oy: (r2() - 0.5) * 24,
    len: 20 + r2() * 26,
    ang: (r2() - 0.5) * 0.8,
    cnt: 5 + Math.floor(r2() * 4),
    sag: 4 + r2() * 6,
  }))]))

  function addFirework(x: number, y: number, big: number, palIdx?: number, willow = false): void {
    const pal = PALETTES[palIdx ?? Math.floor(Math.random() * PALETTES.length)] ?? PALETTES[0]
    if (!pal) return
    const n = Math.round(50 * Math.sqrt(big))
    const sp = 70 * big * (willow ? 0.8 : 1)
    const parts: Spark[] = []
    for (let k = 0; k < n; k++) {
      const zz = Math.random() * 2 - 1
      const a = Math.random() * TAU
      const r = Math.sqrt(1 - zz * zz)
      parts.push({
        x, y, vx: Math.cos(a) * r * sp, vy: Math.sin(a) * r * sp,
        c: willow ? (Math.random() < 0.8 ? '#FFD27A' : '#FFF3C4') : (Math.random() < 0.75 ? pal[0] : pal[1]),
        life: willow ? 2.6 + Math.random() * 0.9 : 1.3 + Math.random() * 0.6,
        age: 0,
      })
    }
    fireworks.push({ parts, t: 0, x, y, big, flash: pal[1], grav: willow ? 12 : 26 })
    if (fireworks.length > MAX_FIREWORKS) fireworks.splice(0, fireworks.length - MAX_FIREWORKS)
  }

  function burstOver(v: Vec3, hMin: number, hMax: number, big: number, pal?: number, willow = false): void {
    const p = proj(v, 0.02)
    if (!p.vis) return
    const f0 = stage.f0()
    addFirework(p.x + rnd(-14, 14) * f0, p.y - rnd(hMin, hMax) * f0, big * f0, pal, willow)
  }

  /** 提灯の波（起点から広がって灯る）。波が来る前は暗く、通った直後は明るい */
  function lanternLit(x: number, y: number): number {
    if (!wave) return 1
    const tt = frame.T - wave.t0
    if (tt > 4) {
      wave = null
      return 1
    }
    const o = proj(stage.origin)
    const k = tt * 420 - Math.hypot(x - o.x, y - o.y)
    return k < 0 ? 0.15 : 1 + Math.max(0, 1 - k / 120)
  }

  function stringCount(c: AnchorState): number {
    return hasVotes(c.heat) ? Math.round(2 + c.heat * 6) : 0
  }

  function drawFireworks(): void {
    const { dt } = frame
    ctx.globalCompositeOperation = 'lighter'
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i]
      if (!f) continue
      f.t += dt
      let any = false
      if (f.t < 0.3) stage.glow(sprite(hexRGB(f.flash)), f.x, f.y, 70 * f.big * (1 - f.t / 0.3), 0.8 * (1 - f.t / 0.3))
      const dk = Math.exp(-1.7 * dt)
      for (const q of f.parts) {
        q.age += dt
        if (q.age > q.life) continue
        any = true
        q.vx *= dk
        q.vy = q.vy * dk + f.grav * dt
        q.x += q.vx * dt
        q.y += q.vy * dt
        const k = q.age / q.life
        stage.glow(sprite(hexRGB(q.c)), q.x, q.y, 3.4 * Math.sqrt(f.big), Math.pow(1 - k, 1.3) * (k > 0.7 ? 0.6 + 0.4 * Math.sin(q.age * 40) : 1))
      }
      if (!any) fireworks.splice(i, 1)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function drawPersistent(): void {
    const { dt, T } = frame
    const f0 = stage.f0()
    const activity = stage.activity()
    ctx.globalCompositeOperation = 'lighter'
    // 提灯の列
    for (const c of stage.anchors) {
      const n = stringCount(c)
      if (!n) continue
      const p = proj(c.vec)
      if (!p.vis) continue
      for (const s of (strings.get(c.region) ?? []).slice(0, n)) {
        const cx = p.x + s.ox * f0
        const cy = p.y + s.oy * f0 - 4 * f0
        const hx = Math.cos(s.ang) * s.len * 0.5 * f0
        const hy = Math.sin(s.ang) * s.len * 0.5 * f0
        const sag = s.sag * f0
        for (let k = 0; k < s.cnt; k++) {
          const u = (k + 0.5) / s.cnt
          const x = cx - hx + 2 * hx * u
          const y = cy - hy + 2 * hy * u + sag * 4 * u * (1 - u)
          const lit = lanternLit(x, y)
          stage.glow(sprites.accentSoft, x, y, 9 * f0, 0.7 * lit)
          ctx.globalAlpha = Math.min(1, lit)
          ctx.fillStyle = k % 2 ? '#FF6A3A' : '#FFB347'
          ctx.beginPath()
          ctx.ellipse(x, y, 1.9 * f0, 2.5 * f0, 0, 0, TAU)
          ctx.fill()
        }
      }
    }
    // 踊りの輪（熱い上位4地方）
    for (const c of stage.anchors.slice(0, 4)) {
      if (!hasVotes(c.heat)) continue
      const p = proj(c.vec)
      if (!p.vis) continue
      const n = Math.round(10 + c.heat * 14)
      const rx = (14 + c.heat * 10) * f0
      const ry = rx * 0.5
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + T * 0.6
        stage.glow(ringSprite, p.x + Math.cos(a) * rx, p.y + Math.sin(a) * ry - 2 * f0 - Math.abs(Math.sin(T * 5 + k)) * 2, 3.2 * f0, 0.9)
      }
      stage.glow(sprites.accent, p.x, p.y - 6 * f0, 10 * f0, 0.8)
    }
    // 熱に応じて上がる花火。にぎわいが大きいほど多い
    if (Math.random() < dt * (0.3 + 2.3 * activity)) {
      const c = pickByHeat(stage.anchors)
      if (c) {
        const p = proj(c.vec, 0.03)
        if (p.vis) addFirework(p.x + rnd(-12, 12) * f0, p.y - rnd(40, 90) * f0, (0.5 + c.heat * 0.7) * f0)
      }
    }
    drawFireworks()
  }

  function topAnchors(n: number): AnchorState[] {
    return stage.anchors.slice(0, n)
  }

  /** 起点に大玉の花火 */
  function big(): void {
    burstOver(stage.origin, 120, 130, 2.6, 5)
    stage.later(0.35, () => burstOver(stage.origin, 60, 80, 1.2, 0))
    stage.later(0.55, () => burstOver(stage.origin, 60, 80, 1.2, 2))
    stage.addEffect({ t: 0, dur: 1.5, zoom: 1.05, draw() {} })
  }

  /** スターマイン（熱い地方で連発） */
  function starmine(): void {
    for (let k = 0; k < 16; k++) {
      stage.later(k * 0.11, () => {
        const c = pick(topAnchors(4))
        burstOver(c.vec, 40, 110, rnd(0.9, 1.4))
      })
    }
  }

  /** 提灯の波が起点から全国へ広がる */
  function lanterns(): void {
    wave = { t0: frame.T }
    stage.addEffect({ t: 0, dur: 4, draw(t) {
      const tp = proj(stage.origin)
      const f0 = stage.f0()
      ctx.globalCompositeOperation = 'lighter'
      for (const c of stage.anchors) {
        const p = proj(c.vec)
        if (!p.vis) continue
        const k = t * 420 - Math.hypot(p.x - tp.x, p.y - tp.y)
        if (k < 0) continue
        stage.glow(sprites.accentSoft, p.x, p.y, (50 + 70 * c.heat) * f0, Math.max(0, 1 - k / 500) * 0.9)
      }
    } })
  }

  /** 全国で花火 */
  function nation(): void {
    for (const c of stage.anchors) {
      stage.later(Math.random() * 0.5, () => burstOver(c.vec, 50, 100, 0.9 + c.heat))
      stage.later(0.5 + Math.random() * 0.6, () => burstOver(c.vec, 40, 90, 0.7 + c.heat * 0.6))
    }
  }

  function kanjiPoints(): [number, number][] {
    const c = document.createElement('canvas')
    c.width = c.height = 160
    const x = c.getContext('2d')
    if (!x) return []
    x.fillStyle = '#fff'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = '900 138px "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif'
    x.fillText('祭', 80, 84)
    const d = x.getImageData(0, 0, 160, 160).data
    const pts: [number, number][] = []
    for (let yy = 0; yy < 160; yy += 3) for (let xx = 0; xx < 160; xx += 3) if ((d[(yy * 160 + xx) * 4 + 3] ?? 0) > 120) pts.push([(xx - 80) / 160, (yy - 80) / 160])
    return pts
  }

  /** レア：「祭」の字の花火 */
  function kanjiFirework(): void {
    const parts = kanjiPoints().map(([tx, ty]) => ({ tx, ty, j: Math.random(), s: sprite(Math.random() < 0.78 ? [255, 211, 107] : (Math.random() < 0.5 ? [255, 111, 168] : [255, 244, 214])) }))
    stage.addEffect({ t: 0, dur: 5.4, draw(t) {
      const { W, H } = frame
      const tp = proj(stage.origin)
      const cx = tp.vis ? clamp(tp.x, W * 0.3, W * 0.7) : W / 2
      const size = Math.min(W * 0.78, H * 0.48)
      const cy = Math.max(size * 0.62, (tp.vis ? tp.y : H * 0.5) - size * 0.55)
      ctx.globalCompositeOperation = 'lighter'
      if (t < 0.35) stage.glow(sprites.white, cx, cy, size * 0.5 * (1 - t / 0.35), 0.9 * (1 - t / 0.35))
      const fly = 1 - Math.pow(1 - clamp(t / 0.9, 0, 1), 3)
      for (const q of parts) {
        const x = cx + q.tx * size * fly
        let y = cy + q.ty * size * fly
        if (t > 2.9) {
          const ft = t - 2.9
          y += 0.22 * size * ft * ft + q.j * ft * size * 0.06
        }
        const a = t < 2.9 ? 0.75 + 0.25 * Math.sin(t * 22 + q.j * 30) : Math.max(0, 1 - (t - 2.9) / 2.2)
        stage.glow(q.s, x, y, Math.max(2.6, size * 0.014), a)
      }
    } })
  }

  /** レア：「祭」の花火、列島が虹色に、柳の花火 */
  function rare(): void {
    stage.later(0.9, kanjiFirework)
    burstOver(stage.origin, 120, 130, 0.5, 5)
    stage.setRare({ dur: 6, mod(q, _x, _y, t) {
      const k = clamp(t / 0.8, 0, 1) * clamp((6 - t) / 1.4, 0, 1)
      if (k <= 0) return null
      return { ox: 0, oy: -Math.abs(Math.sin(frame.T * 3 + q.tw)) * 5 * k, h: k, a: 1 + k * 0.7, col: `hsl(${Math.floor(q.d0 * 360 + t * 140) % 360},100%,74%)` }
    } })
    stage.addEffect({ t: 0, dur: 6, zoom: 1.12, draw() {} })
    wave = { t0: frame.T }
    for (let k = 0; k < 26; k++) stage.later(0.2 + k * 0.14, () => burstOver(pick(stage.anchors).vec, 40, 140, rnd(1.0, 1.8)))
    for (let k = 0; k < 7; k++) {
      stage.later(3.2 + k * 0.25, () => {
        const c = stage.anchors[k % stage.anchors.length]
        if (c) burstOver(c.vec, 150, 220, 2.6, 1, true)
      })
    }
  }

  return { drawPersistent, normal: [big, starmine, lanterns, nation], rare }
}
