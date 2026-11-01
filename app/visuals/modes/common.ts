// 衝動のモードで共通に使う演出の部品（UI モック JpScene のもの）

import { BASE_HEAT } from '../../domain/visualState'
import { easeOut, TAU, type Vec3 } from '../math'
import type { Stage } from '../stage'

/** 票のない地方（基本の熱だけ）では、群衆・提灯などを出さない */
export function hasVotes(heat: number): boolean {
  return heat > BASE_HEAT + 0.01
}

/** 地点から広がる楕円の衝撃波 */
export function shock(stage: Stage, v: Vec3, delay: number, maxR: number, col: string, width = 2): void {
  const { ctx } = stage
  stage.addEffect({ t: 0, dur: delay + 1.6, draw(t) {
    const tt = t - delay
    if (tt < 0) return
    const p = stage.proj(v)
    if (!p.vis) return
    const k = tt / 1.6
    const r = easeOut(k) * maxR * stage.f0()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = (1 - k) * 0.9
    ctx.strokeStyle = col
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, TAU)
    ctx.stroke()
  } })
}

/** 熱の重みで地方を1つ選ぶ */
export function pickByHeat<T extends { heat: number }>(list: readonly T[]): T | undefined {
  let r = Math.random() * list.reduce((a, c) => a + c.heat, 0)
  for (const c of list) {
    r -= c.heat
    if (r <= 0) return c
  }
  return list[0]
}
