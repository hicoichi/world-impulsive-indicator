// 一揆したい：人々の集まり、旗、行進、プラカード（UI モック JpScene の drawIkki と ik* の演出）

import { flag, maskPoints, person, placard, PLACARD_TEXTS, sprite } from '../draw'
import { MARCH_PATHS } from '../geo'
import { angleBetween, clamp, easeBack, easeOut, pick, seeded, slerpV, TAU, type Vec3 } from '../math'
import type { AnchorState, Mode, Stage } from '../stage'
import { hasVotes, shock } from './common'

interface Member {
  dx: number
  dy: number
  fl: boolean
  ph: number
  col: string
}

interface RallyMember extends Member {
  /** 現れるまでの遅れ */
  dl: number
  text: string
}

/** 1地方あたりの群衆の最大人数（UI モック：4 + 熱 × 22） */
const MAX_CROWD = 26
const STREAM_DOTS = 40

export function createIkkiMode(stage: Stage): Mode {
  const { ctx, frame, proj, sprites } = stage
  const accentCss = `rgb(${stage.accent.join(',')})`
  const r2 = seeded(99)

  // 群衆は最大人数ぶんを先に作り、熱に応じて先頭から何人描くかを変える
  const crowds = new Map(stage.anchors.map((c) => {
    const ppl: Member[] = []
    for (let k = 0; k < MAX_CROWD; k++) {
      const a = r2() * TAU
      const d = Math.sqrt(r2()) * (5 + (k / MAX_CROWD) * 15)
      ppl.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.55, fl: r2() < 0.3, ph: r2() * TAU, col: r2() < 0.7 ? '#E5432A' : '#F2B33D' })
    }
    return [c.region, ppl]
  }))

  const streams = MARCH_PATHS.map(pts => ({
    pts,
    dots: Array.from({ length: STREAM_DOTS }, () => ({ u: r2(), sp: 0.03 + r2() * 0.02, off: r2() - 0.5 })),
  }))

  const surges: { t0: number, dur: number }[] = []
  function surge(): number {
    let m = 0
    for (let k = surges.length - 1; k >= 0; k--) {
      const s = surges[k]
      if (!s) continue
      const u = (frame.T - s.t0) / s.dur
      if (u >= 1) surges.splice(k, 1)
      else m = Math.max(m, 1 - u)
    }
    return m
  }
  function addSurge(dur: number): void {
    surges.push({ t0: frame.T, dur })
  }

  function crowdSize(c: AnchorState): number {
    return hasVotes(c.heat) ? Math.round(4 + c.heat * 22) : 0
  }

  function drawPersistent(): void {
    const { dt, T, S } = frame
    const activity = stage.activity()
    // 地方から東京へ流れる光の列。にぎわいが大きいほど多い
    ctx.globalCompositeOperation = 'lighter'
    const dotCount = Math.round(STREAM_DOTS * activity)
    for (const s of streams) {
      s.dots.forEach((d, i) => {
        d.u = (d.u + dt * d.sp) % 1
        if (i >= dotCount) return
        const segN = s.pts.length - 1
        const fu = d.u * segN
        const si = Math.min(segN - 1, Math.floor(fu))
        const a = s.pts[si]
        const b = s.pts[si + 1]
        if (!a || !b) return
        const om = angleBetween(a, b)
        const p = proj(slerpV(a, b, om, Math.sin(om), fu - si))
        if (!p.vis) return
        stage.glow(sprites.accent, p.x + d.off * 6 * S, p.y, 3 * Math.max(0.7, S * 1.3), 0.75)
      })
    }
    // 地方ごとの群衆
    ctx.globalCompositeOperation = 'source-over'
    const sg = surge()
    for (const c of stage.anchors) {
      const n = crowdSize(c)
      if (!n) continue
      const p = proj(c.vec)
      if (!p.vis) continue
      const f = Math.max(0.7, S * 1.5) * p.s
      const h = 9 * f
      const ppl = (crowds.get(c.region) ?? []).slice(0, n).sort((a, b) => a.dy - b.dy)
      for (const q of ppl) {
        const arm = q.fl ? 0.95 : Math.max(sg, 0.3 + 0.35 * Math.sin(T * 2.6 + q.ph))
        ctx.globalAlpha = 0.95
        const [hx, hy] = person(ctx, p.x + q.dx * f, p.y + q.dy * f, h, '#FFE3CC', arm)
        if (q.fl || sg > 0.4) flag(ctx, hx, hy, h * 1.25 * (1 + sg * 0.4), h * 0.8, q.col, q.ph, T)
      }
    }
  }

  function ringPeople(n: number, r0: number, r1: number, flagP: number): RallyMember[] {
    const ppl: RallyMember[] = []
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU
      const d = r0 + Math.random() * (r1 - r0)
      ppl.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.55, dl: (d - r0) / 140, col: Math.random() < 0.7 ? '#E5432A' : '#F2B33D', ph: Math.random() * TAU, fl: Math.random() < flagP, text: pick(PLACARD_TEXTS) })
    }
    return ppl.sort((a, b) => a.dy - b.dy)
  }

  function drawPeopleAt(v: Vec3, ppl: readonly RallyMember[], t: number, out: number): void {
    const p = proj(v)
    if (!p.vis) return
    const f0 = stage.f0() * p.s
    const h = 10 * f0
    ctx.globalCompositeOperation = 'source-over'
    for (const q of ppl) {
      const k = clamp((t - q.dl) / 0.35, 0, 1)
      if (k <= 0) continue
      ctx.globalAlpha = out * Math.min(1, k * 2)
      const hh = h * easeBack(k)
      const arm = q.fl ? 0.95 : 0.55 + 0.4 * Math.sin(frame.T * 5 + q.ph)
      const [hx, hy] = person(ctx, p.x + q.dx * f0, p.y + q.dy * f0, hh, '#FFE9D2', arm)
      if (q.fl) flag(ctx, hx, hy, hh * 1.4, hh * 0.95, q.col, q.ph, frame.T)
    }
    ctx.globalAlpha = 1
  }

  /** 起点に人が集結する */
  function rally(): void {
    const ppl = ringPeople(54, 14, 64, 0.55)
    addSurge(3.8)
    stage.addEffect({ t: 0, dur: 3.8, zoom: 1.06, draw(t) {
      const p = proj(stage.origin)
      if (!p.vis) return
      const out = t > 3.1 ? (3.8 - t) / 0.7 : 1
      const f0 = stage.f0()
      ctx.globalCompositeOperation = 'lighter'
      stage.glow(sprites.accentSoft, p.x, p.y, 110 * f0, 0.6 * out)
      ctx.globalAlpha = 0.7 * out
      ctx.strokeStyle = accentCss
      ctx.lineWidth = 1.5
      const e = easeOut(Math.min(1, t))
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, 70 * f0 * e, 70 * 0.55 * f0 * e, 0, 0, TAU)
      ctx.stroke()
      drawPeopleAt(stage.origin, ppl, t, out)
    } })
  }

  /** 各地で旗が上がる（起点から近い順） */
  function flags(): void {
    const tp = proj(stage.origin)
    addSurge(3.4)
    stage.addEffect({ t: 0, dur: 3.4, draw(t) {
      const f0 = stage.f0()
      ctx.globalCompositeOperation = 'lighter'
      for (const c of stage.anchors) {
        const p = proj(c.vec)
        if (!p.vis) continue
        const k = t - Math.hypot(p.x - tp.x, p.y - tp.y) / 900
        if (k < 0) continue
        stage.glow(sprites.accent, p.x, p.y - 12 * f0, (30 + 50 * c.heat) * f0 * Math.max(0, 1 - k / 1.2), 0.9 * Math.max(0, 1 - k / 1.2))
        stage.glow(sprites.accentSoft, p.x, p.y - 30 * f0 * easeOut(Math.min(1, k)), 22 * f0, 0.6 * Math.max(0, 1 - k / 2))
      }
    } })
  }

  /** 各地から起点へ行進する */
  function march(): void {
    // 起点の地方からは行進しない（位置情報を使わないときの起点は東京＝関東）
    const from = stage.originRegion ?? 'kanto'
    const cols = stage.anchors.filter(c => c.region !== from).map((c) => {
      const om = angleBetween(c.vec, stage.origin)
      return { a: c.vec, om, so: Math.sin(om), ms: Array.from({ length: 12 }, (_, j) => ({ d: j * 0.035, off: (Math.random() - 0.5) * 8, ph: Math.random() * TAU, fl: Math.random() < 0.45 })) }
    })
    stage.addEffect({ t: 0, dur: 4.4, draw(t) {
      const out = t > 3.7 ? (4.4 - t) / 0.7 : 1
      const f0 = stage.f0()
      const prog = easeOut(clamp(t / 3.2, 0, 1))
      for (const c of cols) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.8 * out
        ctx.strokeStyle = accentCss
        ctx.lineWidth = 2
        ctx.beginPath()
        let pen = false
        for (let k = 0; k <= 20; k++) {
          const p = proj(slerpV(c.a, stage.origin, c.om, c.so, (k / 20) * prog))
          if (p.vis) {
            if (pen) ctx.lineTo(p.x, p.y)
            else ctx.moveTo(p.x, p.y)
            pen = true
          }
        }
        ctx.stroke()
        ctx.globalCompositeOperation = 'source-over'
        for (const q of c.ms) {
          const u = clamp(prog * 1.05 - q.d, 0, 1)
          if (u <= 0) continue
          const p = proj(slerpV(c.a, stage.origin, c.om, c.so, u))
          if (!p.vis) continue
          const h = 9 * f0 * p.s
          const bob = Math.abs(Math.sin(frame.T * 9 + q.ph)) * h * 0.1
          ctx.globalAlpha = out * Math.min(1, u * 10)
          const [hx, hy] = person(ctx, p.x + q.off * f0, p.y - bob, h, '#FFE9D2', q.fl ? 0.95 : 0.6)
          if (q.fl) flag(ctx, hx, hy, h * 1.3, h * 0.9, '#E5432A', q.ph, frame.T)
        }
      }
      ctx.globalAlpha = 1
    } })
  }

  /** 群衆の中からプラカードが上がる。票のない地方は起点の周りに出す */
  function placards(): void {
    const picks: { v: Vec3, dx: number, dy: number, text: string, dl: number }[] = []
    for (const c of stage.anchors) {
      const n = crowdSize(c)
      const ppl = (crowds.get(c.region) ?? []).slice(0, n)
      const count = Math.min(ppl.length, 2 + Math.round(c.heat * 6))
      for (let k = 0; k < count; k++) {
        const q = pick(ppl)
        picks.push({ v: c.vec, dx: q.dx, dy: q.dy, text: pick(PLACARD_TEXTS), dl: Math.random() * 0.6 })
      }
    }
    if (picks.length === 0) {
      for (const q of ringPeople(8, 4, 20, 0)) picks.push({ v: stage.origin, dx: q.dx, dy: q.dy, text: q.text, dl: Math.random() * 0.6 })
    }
    addSurge(3.4)
    stage.addEffect({ t: 0, dur: 3.4, draw(t) {
      const out = t > 2.8 ? (3.4 - t) / 0.6 : 1
      ctx.globalCompositeOperation = 'source-over'
      for (const it of picks) {
        const p = proj(it.v)
        if (!p.vis) continue
        const k = clamp((t - it.dl) / 0.35, 0, 1)
        if (k <= 0) continue
        const f = stage.f0() * p.s
        const h = 9 * f
        ctx.globalAlpha = out
        placard(ctx, p.x + it.dx * f + h * 0.2, p.y + it.dy * f - h * 0.9 - h * 0.6 * easeBack(k), h * 1.6 * easeBack(k), it.text)
      }
      ctx.globalAlpha = 1
    } })
  }

  /** レア：巨大な「一揆」の旗が立ち、衝撃波とともに全国で人々が立ち上がる */
  function giantFlag(): void {
    const pts = maskPoints('ikki-flag', 240, 150, 3, (x) => {
      x.fillStyle = '#E8432A'
      x.fillRect(0, 0, 240, 150)
      x.fillStyle = '#FFF4E6'
      x.textAlign = 'center'
      x.textBaseline = 'middle'
      x.font = '900 92px "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif'
      x.fillText('一揆', 120, 80)
    })
    stage.addEffect({ t: 0, dur: 5.6, draw(t) {
      const { W, H, T } = frame
      const tp = proj(stage.origin)
      const bx = tp.vis ? clamp(tp.x, W * 0.22, W * 0.55) : W * 0.4
      const by = tp.vis ? tp.y : H * 0.6
      const poleH = Math.min(H * 0.62, W * 1.1) * easeOut(clamp((t - 0.2) / 1.2, 0, 1))
      const fw = Math.min(W * 0.62, H * 0.5)
      const fh = fw * 0.62
      const out = t > 4.6 ? Math.max(0, (5.6 - t) / 1.0) : 1
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.9 * out
      ctx.strokeStyle = '#FFE9D2'
      ctx.lineWidth = Math.max(2, fw * 0.012)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(bx, by - poleH)
      ctx.stroke()
      stage.glow(sprites.white, bx, by - poleH, 14, out)
      stage.glow(sprites.accentSoft, bx, by, 80 * stage.f0(), 0.7 * out)
      const unfurl = easeOut(clamp((t - 1.1) / 1.0, 0, 1))
      if (unfurl <= 0) return
      const top = by - poleH
      for (const q of pts) {
        if (q.u > unfurl) continue
        const wv = Math.sin(T * 4.2 - q.u * 7) * fh * 0.09 * q.u + Math.sin(T * 2.3 - q.u * 3 + q.v * 2) * fh * 0.04 * q.u
        const x = bx + q.u * fw * (0.96 + 0.04 * Math.cos(T * 4.2 - q.u * 7))
        let y = top + q.v * fh + wv
        if (t > 4.6) y += (t - 4.6) * (t - 4.6) * fh * 0.4 * (0.5 + q.j)
        stage.glow(sprite(q.rgb), x, y, Math.max(2.4, fw * 0.011), (0.7 + 0.3 * Math.sin(T * 9 + q.j * 30)) * out)
      }
    } })
  }

  function rare(): void {
    stage.setRare({ dur: 5.6, mod(q, x, y, t, tp) {
      const d = Math.hypot(x - tp.x, y - tp.y)
      const front = t * 480
      const band = Math.max(0, 1 - Math.abs(d - front) / 80)
      const lit = clamp((front - d) / 160, 0, 1) * clamp((5.6 - t) / 1.4, 0, 1)
      return { ox: 0, oy: -band * 18 - lit * 2.5 * Math.abs(Math.sin(frame.T * 7 + q.tw)), h: lit, a: 1 + band * 1.5 }
    } })
    addSurge(5.6)
    stage.addEffect({ t: 0, dur: 5.6, zoom: 1.14, draw() {} })
    stage.later(0.5, giantFlag)
    for (const d of [0, 0.4, 0.8]) shock(stage, stage.origin, d, 520, accentCss, 3)
    const tp = proj(stage.origin)
    for (const c of stage.anchors) {
      const ppl = ringPeople(Math.round(16 + c.heat * 30), 8, 26 + c.heat * 30, 0.6)
      const p = proj(c.vec)
      const dl = Math.hypot(p.x - tp.x, p.y - tp.y) / 480
      stage.addEffect({ t: 0, dur: 5.6, draw(t) {
        const tt = t - dl
        if (tt < 0) return
        drawPeopleAt(c.vec, ppl, tt, t > 4.8 ? (5.6 - t) / 0.8 : 1)
      } })
    }
  }

  return { drawPersistent, normal: [rally, flags, march, placards], rare }
}
