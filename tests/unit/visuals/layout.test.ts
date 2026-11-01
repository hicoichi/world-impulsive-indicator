import { describe, expect, test } from 'vitest'
import { FLAG_ASPECT, giantFlagLayout, HEADER_BOTTOM, isWideLayout, SCREEN_MARGIN } from '../../../app/visuals/layout'

/** 旗が伸びきったときの外枠（揺れは除く） */
function bounds(w: number, h: number, origin: { x: number, y: number } | null) {
  const l = giantFlagLayout(w, h, origin)
  const top = l.by - l.poleH
  return { left: l.bx, right: l.bx + l.fw, top, bottom: top + l.fw * FLAG_ASPECT }
}

describe('isWideLayout', () => {
  test('CSS と同じく、幅 900 以上かつ高さ 520 以上で PC', () => {
    expect(isWideLayout(1280, 800)).toBe(true)
    expect(isWideLayout(899, 800)).toBe(false)
    expect(isWideLayout(1280, 519)).toBe(false)
    expect(isWideLayout(390, 844)).toBe(false)
  })
})

describe('一揆のレアの演出の巨大な旗', () => {
  test.each([
    ['iPhone（390×844）', 390, 844],
    ['小さいスマホ（320×568）', 320, 568],
    ['大きいスマホ（430×932）', 430, 932],
    ['タブレット縦（768×1024）', 768, 1024],
  ])('スマホ：画面からはみ出さない（%s）', (_, w, h) => {
    // 起点（東京）が画面のどこにあっても収まる
    for (const origin of [null, { x: w * 0.6, y: h * 0.43 }, { x: w * 0.95, y: h * 0.3 }, { x: 0, y: h * 0.9 }]) {
      const b = bounds(w, h, origin)
      expect(b.left).toBeGreaterThanOrEqual(SCREEN_MARGIN)
      expect(b.right).toBeLessThanOrEqual(w - SCREEN_MARGIN)
      expect(b.top).toBeGreaterThanOrEqual(HEADER_BOTTOM)
      expect(b.bottom).toBeLessThanOrEqual(h)
    }
  })

  test('スマホ：旗は小さくなりすぎない（画面幅の半分以上）', () => {
    expect(giantFlagLayout(390, 844, { x: 234, y: 365 }).fw).toBeGreaterThan(390 / 2)
  })

  test('PC：UI モックの値のまま', () => {
    const l = giantFlagLayout(1280, 800, { x: 900, y: 500 })
    expect(l).toEqual({ bx: 1280 * 0.55, by: 500, poleH: Math.min(800 * 0.62, 1280 * 1.1), fw: Math.min(1280 * 0.62, 800 * 0.5) })
    expect(giantFlagLayout(1280, 800, null).bx).toBe(1280 * 0.4)
  })
})
