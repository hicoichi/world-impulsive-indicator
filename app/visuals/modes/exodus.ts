// 国外脱出したい：空港、世界への航路、飛び立つ飛行機（UI モック JpScene の drawExodus と ex* の演出）

import { maskPoints, planePath, sprite } from '../draw'
import { AIRPORTS, DESTINATIONS, LAUNCH_PAD } from '../geo'
import { angleBetween, clamp, easeOut, rnd, seeded, slerpV, TAU, vec, type Vec3 } from '../math'
import type { Mode, Projected, Stage } from '../stage'
import { shock } from './common'

interface Route {
  a: Vec3
  b: Vec3
  om: number
  so: number
  h: number
}

interface Plane {
  rt: Route
  u: number
  sc: number
}

/** 演出で飛ばす飛行機。u0 から sp の速さで進む */
interface ScriptedPlane {
  rt: Route
  u0: number
  sp: number
  sc: number
}

/** 空港に集まる人の光の最大数（UI モック：6 + 重み × 16） */
const MAX_ARRIVALS = 22

function mkRoute(a: Vec3, b: Vec3, hk = 0.05): Route {
  const om = angleBetween(a, b)
  return { a, b, om, so: Math.sin(om), h: hk + om * 0.05 }
}

function farPoint(a: Vec3): Vec3 {
  for (;;) {
    const b = vec(rnd(-35, 65), rnd(-180, 180))
    const om = angleBetween(a, b)
    if (om > 0.6 && om < 2.6) return b
  }
}

export function createExodusMode(stage: Stage): Mode {
  const { ctx, frame, proj, sprites } = stage
  const r2 = seeded(99)
  const APV = AIRPORTS.map(a => a.vec)

  const airports = AIRPORTS.map(a => ({
    ...a,
    arrivals: Array.from({ length: MAX_ARRIVALS }, () => ({ a: r2() * TAU, ph: r2(), sp: 0.15 + r2() * 0.12 })),
  }))
  const airportWeight = (region: (typeof AIRPORTS)[number]['region']) => stage.anchorOf(region).heat

  const routes = DESTINATIONS.map((b, k) => {
    const ap = AIRPORTS[k % 3 === 2 ? (2 + (k % 4)) % AIRPORTS.length : k % 2] ?? AIRPORTS[0]
    if (!ap) throw new Error('空港がない')
    const planes: Plane[] = []
    return { ...mkRoute(ap.vec, b, 0.04), region: ap.region, every: 2.5 + r2() * 4, timer: r2() * 4, planes }
  })

  const scripted: { t0: number, planes: ScriptedPlane[], dur: number }[] = []

  function point(rt: Route, u: number): Projected {
    return proj(slerpV(rt.a, rt.b, rt.om, rt.so, u), rt.h * Math.sin(Math.PI * u))
  }

  function drawPlane(rt: Route, u: number, s: number): void {
    const A = point(rt, u)
    const B = point(rt, Math.min(1, u + 0.005))
    if (!A.vis) return
    ctx.globalCompositeOperation = 'lighter'
    let prev: Projected | null = null
    for (let k = 0; k <= 10; k++) {
      const uu = u - 0.12 * (1 - k / 10)
      if (uu < 0) continue
      const P = point(rt, uu)
      if (prev && P.vis) {
        ctx.globalAlpha = (0.6 * k) / 10
        ctx.strokeStyle = '#DDF0FF'
        ctx.lineWidth = (0.5 + (1.5 * k) / 10) * s
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(P.x, P.y)
        ctx.stroke()
      }
      prev = P.vis ? P : null
    }
    stage.glow(sprites.cyan, A.x, A.y, 14 * s * A.s, 0.5)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.save()
    ctx.translate(A.x, A.y)
    ctx.rotate(Math.atan2(B.y - A.y, B.x - A.x))
    planePath(ctx, 0.75 * s * A.s)
    ctx.fillStyle = '#F4FAFF'
    ctx.fill()
    ctx.restore()
  }

  function drawPersistent(): void {
    const { dt, T } = frame
    const f0 = Math.max(0.7, frame.S * 1.4)
    const activity = stage.activity()
    // 航路と定期便。にぎわいが大きいほど、また出発空港の地方が熱いほど便が増える
    ctx.globalCompositeOperation = 'lighter'
    ctx.setLineDash([3 * f0, 5 * f0])
    ctx.lineDashOffset = -T * 20
    for (const rt of routes) {
      const pace = 0.25 + 0.45 * activity + 0.3 * airportWeight(rt.region)
      rt.timer -= dt * pace
      if (rt.timer <= 0) {
        rt.planes.push({ rt, u: 0, sc: 1 })
        rt.timer = rt.every
      }
      for (const pl of rt.planes) pl.u += dt / (3 + rt.om * 3)
      rt.planes = rt.planes.filter(pl => pl.u < 1)
      ctx.strokeStyle = `rgba(130,200,255,${0.2 + 0.2 * activity})`
      ctx.lineWidth = 1
      ctx.globalAlpha = 1
      ctx.beginPath()
      let pen = false
      for (let k = 0; k <= 40; k++) {
        const p = point(rt, k / 40)
        if (p.vis) {
          if (pen) ctx.lineTo(p.x, p.y)
          else ctx.moveTo(p.x, p.y)
          pen = true
        }
        else {
          pen = false
        }
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
    for (const ap of airports) {
      const p = proj(ap.vec)
      if (!p.vis) continue
      const w = airportWeight(ap.region)
      stage.glow(sprites.cyan, p.x, p.y, (14 + w * 16) * f0, 0.6 + 0.3 * Math.sin(T * 3 + w * 7))
      const n = Math.round(MAX_ARRIVALS * activity * w)
      ap.arrivals.slice(0, n).forEach((q) => {
        const fr = (T * q.sp + q.ph) % 1
        const d = (60 + w * 30) * (1 - fr) * f0
        stage.glow(sprites.white, p.x + Math.cos(q.a) * d, p.y + Math.sin(q.a) * d * 0.55, 2.2, Math.sin(fr * Math.PI) * 0.9)
      })
    }
    ctx.globalCompositeOperation = 'source-over'
    for (const ap of airports) {
      const p = proj(ap.vec)
      if (!p.vis) continue
      const r = (7 + airportWeight(ap.region) * 5) * f0
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = '#9FD8FF'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, -T, -T + 4.4)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 1.6, T * 0.6, T * 0.6 + 1.6)
      ctx.stroke()
      ctx.fillStyle = '#CFEAFF'
      ctx.font = '600 9px "Chakra Petch", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(ap.code, p.x + r * 1.8, p.y + r * 0.9)
    }
    for (const rt of routes) for (const pl of rt.planes) drawPlane(rt, pl.u, f0)
    for (let k = scripted.length - 1; k >= 0; k--) {
      const s = scripted[k]
      if (!s) continue
      const t = T - s.t0
      if (t > s.dur) {
        scripted.splice(k, 1)
        continue
      }
      for (const pl of s.planes) {
        const u = pl.u0 + t * pl.sp
        if (u > 0 && u < 1) drawPlane(pl.rt, u, pl.sc * f0)
      }
    }
  }

  function fly(planes: ScriptedPlane[], dur: number, zoom: number): void {
    scripted.push({ t0: frame.T, planes, dur })
    stage.addEffect({ t: 0, dur, zoom, draw() {} })
  }

  function origin(): Vec3 {
    return APV[0] ?? stage.origin
  }

  /** 成田から大きな1機が離陸する */
  function takeoff(): void {
    const a = origin()
    stage.addEffect({ t: 0, dur: 1.4, draw(t) {
      const p = proj(a)
      if (!p.vis) return
      ctx.globalCompositeOperation = 'lighter'
      stage.glow(sprites.white, p.x, p.y, 60 * stage.f0() * (1 - t / 1.4) + 8, 1 - t / 1.4)
    } })
    fly([{ rt: mkRoute(a, farPoint(a), 0.12), u0: -0.02, sp: 0.16, sc: 3.0 }], 6.5, 1.05)
  }

  /** 各空港から10機が編隊で飛び立つ */
  function wave(): void {
    const planes: ScriptedPlane[] = []
    for (let k = 0; k < 10; k++) {
      const a = APV[k % APV.length] ?? origin()
      planes.push({ rt: mkRoute(a, farPoint(a)), u0: -k * 0.05, sp: 0.28, sc: 1.6 })
    }
    fly(planes, 4.8, 1.04)
  }

  /** 空港へ人が集まる */
  function crowd(): void {
    const dots = Array.from({ length: 120 }, (_, k) => ({ ap: APV[k % 3] ?? origin(), a: Math.random() * TAU, d0: rnd(90, 200), dl: Math.random() * 1.2, sp: rnd(1.4, 2.2) }))
    stage.addEffect({ t: 0, dur: 3.6, draw(t) {
      const f0 = stage.f0()
      ctx.globalCompositeOperation = 'lighter'
      for (const q of dots) {
        const k = clamp((t - q.dl) / q.sp, 0, 1)
        if (k <= 0 || k >= 1) continue
        const p = proj(q.ap)
        if (!p.vis) continue
        const d = q.d0 * (1 - easeOut(k)) * f0
        const x = p.x + Math.cos(q.a) * d
        const y = p.y + Math.sin(q.a) * d * 0.55
        stage.glow(sprites.white, x, y, 3, Math.sin(k * Math.PI))
        ctx.globalAlpha = 0.35 * Math.sin(k * Math.PI)
        ctx.strokeStyle = '#BFE6FF'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(q.a) * 12 * f0, y + Math.sin(q.a) * 6.6 * f0)
        ctx.stroke()
      }
      for (let i = 0; i < 3; i++) {
        const v = APV[i]
        if (!v) continue
        const p = proj(v)
        if (p.vis) stage.glow(sprites.cyan, p.x, p.y, (30 + 20 * Math.sin(t * 6)) * f0, 0.5 + 0.4 * clamp(t - 1.2, 0, 1) * clamp((3.6 - t) / 0.8, 0, 1))
      }
    } })
  }

  /** 世界中へ18本の航路が伸びる */
  function routeBurst(): void {
    const list = Array.from({ length: 18 }, (_, k) => ({ rt: mkRoute(APV[k % 2] ?? origin(), vec(rnd(-40, 65), (k / 18) * 360 - 180)), dl: k * 0.05 }))
    stage.addEffect({ t: 0, dur: 6, draw(t) {
      const out = t > 5.2 ? (6 - t) / 0.8 : 1
      ctx.globalCompositeOperation = 'lighter'
      for (const it of list) {
        const g2 = easeOut(clamp((t - it.dl) / 1.4, 0, 1))
        if (g2 <= 0) continue
        ctx.globalAlpha = 0.85 * out
        ctx.strokeStyle = '#A8DCFF'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        let pen = false
        let lastP: Projected | null = null
        for (let k = 0; k <= 30; k++) {
          const p = point(it.rt, (k / 30) * g2)
          if (p.vis) {
            if (pen) ctx.lineTo(p.x, p.y)
            else ctx.moveTo(p.x, p.y)
            pen = true
            lastP = p
          }
          else {
            pen = false
          }
        }
        ctx.stroke()
        if (lastP && g2 < 1) stage.glow(sprites.white, lastP.x, lastP.y, 8, 0.9)
      }
    } })
    fly(list.map(it => ({ rt: it.rt, u0: -0.35 - it.dl * 0.3, sp: 0.22, sc: 1.2 })), 6, 1)
  }

  interface Trail { x: number, y: number, age: number, life: number, vx: number, vy: number, r0: number, grow: number, a: number, s?: HTMLCanvasElement }

  function drawTrail(trail: Trail[], dt: number): void {
    for (let i = trail.length - 1; i >= 0; i--) {
      const q = trail[i]
      if (!q) continue
      q.age += dt
      if (q.age > q.life) {
        trail.splice(i, 1)
        continue
      }
      q.vx *= Math.exp(-1.2 * dt)
      q.vy *= Math.exp(-1.2 * dt)
      q.x += q.vx * dt
      q.y += q.vy * dt
      stage.glow(q.s ?? sprites.white, q.x, q.y, q.r0 + q.age * q.grow, (1 - q.age / q.life) * q.a)
    }
  }

  /** レア：成田から離陸したジャンボ機が、カメラの前を通り過ぎていく */
  function giantJet(): void {
    const pts = maskPoints('exodus-jet', 220, 200, 3, (x) => {
      x.translate(110, 100)
      planePath(x, 10.5)
      x.fillStyle = '#EAF6FF'
      x.fill()
    })
    const trail: Trail[] = []
    let last = 0
    stage.addEffect({ t: 0, dur: 6.2, draw(t) {
      const { W, H, T } = frame
      const dt = Math.max(0, t - last)
      last = t
      const sp = proj(origin())
      const sx = sp.vis ? sp.x : W * 0.6
      const sy = sp.vis ? sp.y : H * 0.55
      const path = (k: number) => {
        const e = k * k * (3 - 2 * k) * 0.35 + Math.pow(k, 2.2) * 0.65
        return [sx + (W * 0.42 - sx) * e + Math.sin(k * Math.PI) * W * 0.18, sy + (-H * 0.35 - sy) * e] as const
      }
      const k = clamp((t - 0.5) / 3.6, 0, 1)
      const [cx, cy] = path(k)
      const [nx, ny] = path(Math.min(1, k + 0.01))
      const ang = k < 1 ? Math.atan2(ny - cy, nx - cx) : -Math.PI / 2
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const size = Math.max(W, H) * (0.03 + 0.62 * Math.pow(k, 1.7))
      ctx.globalCompositeOperation = 'lighter'
      if (t < 1.2 && sp.vis) stage.glow(sprites.white, sx, sy, 70 * stage.f0() * (1 - t / 1.2) + 6, 1 - t / 1.2)
      if (k > 0 && k < 1) {
        for (const o of [-0.27, -0.15, 0.15, 0.27]) {
          const px = cx - ca * size * 0.12 - sa * o * size
          const py = cy - sa * size * 0.12 + ca * o * size
          for (let n = 0; n < 2; n++) trail.push({ x: px + rnd(-1, 1), y: py + rnd(-1, 1), age: 0, life: rnd(1.4, 2.4), vx: -ca * rnd(5, 25), vy: -sa * rnd(5, 25), r0: 1.5 + size * 0.008, grow: 4 + size * 0.02, a: 0.32 })
        }
      }
      drawTrail(trail, dt)
      if (k <= 0 || k >= 1) return
      const dotR = Math.max(1.6, size * 0.012)
      for (const q of pts) {
        const lx = (q.u - 0.5) * size
        const ly = (q.v - 0.5) * size * (200 / 220)
        stage.glow(sprites.white, cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, dotR, 0.75 + 0.25 * Math.sin(T * 12 + q.j * 30))
      }
      stage.glow(sprites.cyan, cx, cy, size * 0.6, 0.22)
    } })
  }

  /** レア：種子島からロケットが打ち上がる */
  function giantRocket(): void {
    const pts = maskPoints('exodus-rocket', 100, 300, 3, (x) => {
      x.fillStyle = '#F3F7FF'
      x.fillRect(36, 70, 28, 190)
      x.beginPath()
      x.moveTo(36, 72)
      x.quadraticCurveTo(50, 2, 64, 72)
      x.closePath()
      x.fill()
      x.fillStyle = '#FF5A3C'
      x.beginPath()
      x.moveTo(40, 40)
      x.quadraticCurveTo(50, 2, 60, 40)
      x.closePath()
      x.fill()
      x.fillRect(36, 150, 28, 8)
      x.fillStyle = '#F3F7FF'
      x.fillRect(16, 140, 16, 110)
      x.fillRect(68, 140, 16, 110)
      x.beginPath()
      x.moveTo(16, 142)
      x.lineTo(24, 118)
      x.lineTo(32, 142)
      x.closePath()
      x.fill()
      x.beginPath()
      x.moveTo(68, 142)
      x.lineTo(76, 118)
      x.lineTo(84, 142)
      x.closePath()
      x.fill()
      x.fillStyle = '#C9D6E8'
      x.beginPath()
      x.moveTo(36, 255)
      x.lineTo(28, 290)
      x.lineTo(72, 290)
      x.lineTo(64, 255)
      x.closePath()
      x.fill()
    })
    const trail: Trail[] = []
    let last = 0
    const SF = sprite([255, 170, 70])
    const SY = sprite([255, 230, 150])
    stage.addEffect({ t: 0, dur: 6.6, draw(t) {
      const { W, H, T } = frame
      const dt = Math.max(0, t - last)
      last = t
      const pp = proj(LAUNCH_PAD)
      const sx = pp.vis ? pp.x : W * 0.35
      const sy = pp.vis ? pp.y : H * 0.7
      const k = clamp((t - 1.0) / 3.8, 0, 1)
      const cx = sx + Math.sin(k * 1.4) * W * 0.12
      const cy = sy + (-H * 0.55 - sy) * Math.pow(k, 2.4)
      const size = Math.max(W, H) * (0.05 + 0.55 * Math.pow(k, 1.5))
      ctx.globalCompositeOperation = 'lighter'
      if (t < 1.6 && pp.vis) {
        const ig = Math.min(1, t / 0.6)
        stage.glow(SF, sx, sy, (30 + 30 * Math.sin(T * 40)) * stage.f0() * ig, 0.9 * ig)
      }
      if (t < 1.4) for (let n = 0; n < 4; n++) trail.push({ x: sx + rnd(-4, 4), y: sy, age: 0, life: rnd(1.2, 2.2), vx: rnd(-60, 60), vy: rnd(-8, 4), r0: 3, grow: 14, a: 0.25 })
      const bx = cx
      const by = cy + size * 0.5
      if (k > 0 && k < 1) {
        for (let n = 0; n < 5; n++) trail.push({ x: bx + rnd(-1, 1) * size * 0.05, y: by, age: 0, life: rnd(0.25, 0.5), vx: rnd(-20, 20), vy: rnd(80, 200), r0: size * 0.03 + 2, grow: size * 0.05, a: 0.9, s: n < 2 ? SY : SF })
        for (let n = 0; n < 3; n++) trail.push({ x: bx + rnd(-1, 1) * size * 0.06, y: by + size * 0.1, age: 0, life: rnd(1.8, 3.0), vx: rnd(-25, 25), vy: rnd(10, 40), r0: size * 0.02 + 2, grow: 10 + size * 0.04, a: 0.22 })
      }
      drawTrail(trail, dt)
      if (k <= 0 || k >= 1) return
      stage.glow(SY, bx, by + size * 0.06, size * 0.22, 0.9)
      const dotR = Math.max(1.6, size * 0.012)
      for (const q of pts) {
        const s2 = q.rgb[0] > 240 && q.rgb[1] < 120 ? SF : sprites.white
        stage.glow(s2, cx + ((q.u - 0.5) * size) / 3, cy + (q.v - 0.5) * size, dotR, 0.75 + 0.25 * Math.sin(T * 12 + q.j * 30))
      }
    } })
  }

  /** レア：列島の粒子が空へ舞い上がり、ジャンボ機（60%）かロケット（40%）が飛び立つ */
  function rare(): void {
    stage.setRare({ dur: 6.6, mod(q, x, y, t, tp) {
      const lt = t - 1.0 - q.d0 * 0.9
      let b = 0
      if (lt > 0 && lt < 1.6) b = Math.pow(lt / 1.6, 2)
      else if (lt >= 1.6 && lt < 2.6) b = 1
      else if (lt >= 2.6 && lt < 4.2) b = 1 - easeOut((lt - 2.6) / 1.6)
      return { ox: (x - tp.x) * 0.5 * b + q.sx * frame.W * 0.12 * b, oy: -b * frame.H * (0.45 + q.d0 * 0.5), h: 0, a: 1 + b * 0.6, col: b > 0.03 ? 'rgb(205,236,255)' : null }
    } })
    const rocket = Math.random() < 0.4
    const planes: ScriptedPlane[] = []
    for (let k = 0; k < (rocket ? 14 : 36); k++) {
      const a = APV[k % APV.length] ?? origin()
      planes.push({ rt: mkRoute(a, farPoint(a), 0.08), u0: -Math.random() * 0.25 - (rocket ? 0.3 : 0), sp: 0.24, sc: 1.4 })
    }
    fly(planes, 5.6, 0.9)
    if (rocket) {
      giantRocket()
      shock(stage, LAUNCH_PAD, 1.0, 300, 'rgb(255,190,110)', 3)
    }
    else {
      giantJet()
    }
    stage.addEffect({ t: 0, dur: 5.6, draw(t) {
      ctx.globalCompositeOperation = 'lighter'
      const p = proj(stage.origin)
      if (p.vis) stage.glow(sprites.cyan, p.x, p.y, 200 * stage.f0(), 0.6 * clamp(1 - t / 2.5, 0, 1))
    } })
  }

  return { drawPersistent, normal: [takeoff, wave, crowd, routeBurst], rare }
}
