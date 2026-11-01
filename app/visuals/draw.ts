// 描画の部品：光のスプライト、星空、人・旗・プラカード・飛行機の形。形と値は UI モック（JpScene）のもの。
// スプライトは画面によらないため、全画面で使い回す

import { seeded, TAU, type RGB } from './math'

type Ctx = CanvasRenderingContext2D

function canvas2d(width: number, height: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const x = c.getContext('2d')
  if (!x) throw new Error('Canvas 2D を使えない')
  return [c, x]
}

const spriteCache = new Map<string, HTMLCanvasElement>()

/** 丸い光。soft は中心の白い芯がない柔らかい光 */
export function sprite([r, g, b]: RGB, soft = false): HTMLCanvasElement {
  const key = `${r},${g},${b}${soft ? 's' : ''}`
  const hit = spriteCache.get(key)
  if (hit) return hit
  const [c, x] = canvas2d(64, 64)
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  const rgb = `${r},${g},${b}`
  if (soft) {
    gr.addColorStop(0, `rgba(${rgb},0.7)`)
    gr.addColorStop(0.5, `rgba(${rgb},0.2)`)
  }
  else {
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.18, `rgba(${rgb},0.85)`)
    gr.addColorStop(0.5, `rgba(${rgb},0.2)`)
  }
  gr.addColorStop(1, `rgba(${rgb},0)`)
  x.fillStyle = gr
  x.fillRect(0, 0, 64, 64)
  spriteCache.set(key, c)
  return c
}

export function glow(ctx: Ctx, s: HTMLCanvasElement, x: number, y: number, r: number, a: number): void {
  if (a <= 0.004 || r < 0.5) return
  ctx.globalAlpha = Math.min(1, a)
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2)
}

let starsCache: HTMLCanvasElement | null = null

export function stars(): HTMLCanvasElement {
  if (starsCache) return starsCache
  const [c, x] = canvas2d(1024, 1024)
  const r = seeded(5)
  for (let k = 0; k < 700; k++) {
    x.fillStyle = `rgba(220,230,255,${0.15 + r() * 0.55})`
    x.beginPath()
    x.arc(r() * 1024, r() * 1024, 0.3 + r() * 0.9, 0, TAU)
    x.fill()
  }
  starsCache = c
  return c
}

/** 人の形。arm は腕の上げ具合（0〜1）。手の位置を返す */
export function person(ctx: Ctx, x: number, y: number, h: number, col: string, arm: number): [number, number] {
  const r = h * 0.16
  const sw = h * 0.17
  const nk = y - h + 2 * r
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y - h + r, r, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - sw, nk + h * 0.04)
  ctx.lineTo(x + sw, nk + h * 0.04)
  ctx.lineTo(x + sw * 0.85, y - h * 0.3)
  ctx.lineTo(x - sw * 0.85, y - h * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(x - sw * 0.8, y - h * 0.32, sw * 0.62, h * 0.32)
  ctx.fillRect(x + sw * 0.18, y - h * 0.32, sw * 0.62, h * 0.32)
  const sy = nk + h * 0.08
  ctx.strokeStyle = col
  ctx.lineWidth = Math.max(0.8, h * 0.085)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x + sw * 0.8, sy)
  const hx = x + sw * 0.8 + h * 0.14 * (1 - arm * 0.4)
  const hy = sy + h * 0.3 - h * 0.62 * arm
  ctx.lineTo(hx, hy)
  ctx.stroke()
  return [hx, hy]
}

/** はためく旗。t は経過時間（秒） */
export function flag(ctx: Ctx, hx: number, hy: number, len: number, fw: number, col: string, ph: number, t: number): void {
  ctx.strokeStyle = 'rgba(255,235,215,0.9)'
  ctx.lineWidth = Math.max(0.7, len * 0.05)
  ctx.beginPath()
  ctx.moveTo(hx, hy + len * 0.1)
  ctx.lineTo(hx, hy - len)
  ctx.stroke()
  const top = hy - len
  const fh = fw * 0.62
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.moveTo(hx, top)
  for (let k = 1; k <= 4; k++) {
    const u = k / 4
    ctx.lineTo(hx + fw * u, top + Math.sin(t * 6 + ph + u * 3) * fh * 0.2 * u)
  }
  for (let k = 4; k >= 0; k--) {
    const u = k / 4
    ctx.lineTo(hx + fw * u, top + fh + Math.sin(t * 6 + ph + u * 3) * fh * 0.2 * u)
  }
  ctx.closePath()
  ctx.fill()
}

/** プラカード。文言は英語の気持ちの表明（docs/frontend-plan.md Q-15） */
export function placard(ctx: Ctx, hx: number, hy: number, h: number, text: string): void {
  const bw = h * 1.3
  const bh = h * 0.74
  const top = hy - h * 0.98
  ctx.strokeStyle = 'rgba(235,225,210,0.95)'
  ctx.lineWidth = Math.max(0.7, h * 0.06)
  ctx.beginPath()
  ctx.moveTo(hx, hy + h * 0.1)
  ctx.lineTo(hx, top + bh)
  ctx.stroke()
  ctx.fillStyle = '#FBF6EC'
  ctx.fillRect(hx - bw / 2, top, bw, bh)
  ctx.fillStyle = '#B3170A'
  if (bh > 8) {
    ctx.font = `700 ${(bh * 0.5).toFixed(1)}px "Chakra Petch", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, hx, top + bh * 0.54, bw * 0.9)
    ctx.textAlign = 'left'
  }
  else {
    ctx.fillRect(hx - bw * 0.32, top + bh * 0.38, bw * 0.64, bh * 0.24)
  }
}

/** プラカードの文言（docs/frontend-plan.md Q-15：命令形を使わない） */
export const PLACARD_TEXTS = ['NO!', 'ENOUGH!', 'FED UP', 'ANGRY', 'IKKI!'] as const

/** 飛行機の形のパス（機首が +x） */
export function planePath(ctx: Ctx | OffscreenCanvasRenderingContext2D, s: number): void {
  ctx.beginPath()
  ctx.moveTo(10 * s, 0)
  ctx.quadraticCurveTo(9 * s, -1.4 * s, 6 * s, -1.4 * s)
  ctx.lineTo(1.5 * s, -1.4 * s)
  ctx.lineTo(-2.5 * s, -8.5 * s)
  ctx.lineTo(-4.6 * s, -8.5 * s)
  ctx.lineTo(-2.2 * s, -1.4 * s)
  ctx.lineTo(-6.6 * s, -1.2 * s)
  ctx.lineTo(-8.6 * s, -4.2 * s)
  ctx.lineTo(-9.9 * s, -4.2 * s)
  ctx.lineTo(-8.9 * s, 0)
  ctx.lineTo(-9.9 * s, 4.2 * s)
  ctx.lineTo(-8.6 * s, 4.2 * s)
  ctx.lineTo(-6.6 * s, 1.2 * s)
  ctx.lineTo(-2.2 * s, 1.4 * s)
  ctx.lineTo(-4.6 * s, 8.5 * s)
  ctx.lineTo(-2.5 * s, 8.5 * s)
  ctx.lineTo(1.5 * s, 1.4 * s)
  ctx.lineTo(6 * s, 1.4 * s)
  ctx.quadraticCurveTo(9 * s, 1.4 * s, 10 * s, 0)
  ctx.closePath()
}

export interface MaskPoint {
  u: number
  v: number
  rgb: RGB
  j: number
}

const maskCache = new Map<string, MaskPoint[]>()

/** 形を描いて、その中の点を粒子として取り出す（レアの演出の巨大な旗・飛行機・ロケット・文字） */
export function maskPoints(key: string, width: number, height: number, step: number, drawFn: (x: Ctx) => void): MaskPoint[] {
  const hit = maskCache.get(key)
  // フォントの読み込み前は文字が描けず点が少ないため、少なければ作り直す
  if (hit && hit.length > 40) return hit
  const [, x] = canvas2d(width, height)
  drawFn(x)
  const d = x.getImageData(0, 0, width, height).data
  const pts: MaskPoint[] = []
  for (let yy = 0; yy < height; yy += step) {
    for (let xx = 0; xx < width; xx += step) {
      const i = (yy * width + xx) * 4
      if ((d[i + 3] ?? 0) > 120) pts.push({ u: xx / width, v: yy / height, rgb: [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0], j: Math.random() })
    }
  }
  maskCache.set(key, pts)
  return pts
}
