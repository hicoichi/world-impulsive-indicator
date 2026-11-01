import { describe, expect, test } from 'vitest'
import { indexAt, loopPanels, positionOf, settledPosition, WHEEL_MIN_DELTA, wheelDirection } from '../../../app/domain/loop'
import { IMPULSE_KEYS } from '#shared/domain/impulse'

describe('loopPanels', () => {
  test('両端に複製を置き、本物は衝動の順序どおり', () => {
    const panels = loopPanels(IMPULSE_KEYS)
    expect(panels.map(p => p.item)).toEqual(['festival', 'ikki', 'exodus', 'festival', 'ikki'])
    expect(panels.map(p => p.clone)).toEqual([true, false, false, false, true])
    expect(panels.map(p => p.index)).toEqual([2, 0, 1, 2, 0])
  })

  test('空なら空', () => {
    expect(loopPanels([])).toEqual([])
  })
})

describe('位置と番号', () => {
  test('本物の位置は番号 + 1', () => {
    expect(IMPULSE_KEYS.map((_, i) => positionOf(i))).toEqual([1, 2, 3])
  })

  test('複製の位置は、対応する本物の番号になる', () => {
    expect([0, 1, 2, 3, 4].map(p => indexAt(p, 3))).toEqual([2, 0, 1, 2, 0])
  })

  test('複製に止まったら本物の位置へ移す（ループ）', () => {
    expect(settledPosition(0, 3)).toBe(3)
    expect(settledPosition(4, 3)).toBe(1)
    expect([1, 2, 3].map(p => settledPosition(p, 3))).toEqual([1, 2, 3])
  })
})

describe('wheelDirection', () => {
  test('縦の移動が大きいときだけ切り替える', () => {
    expect(wheelDirection(0, WHEEL_MIN_DELTA)).toBe(1)
    expect(wheelDirection(0, -WHEEL_MIN_DELTA)).toBe(-1)
  })

  test('小さな移動・横の移動は無視する', () => {
    expect(wheelDirection(0, WHEEL_MIN_DELTA - 1)).toBe(0)
    expect(wheelDirection(40, 30)).toBe(0)
  })
})
