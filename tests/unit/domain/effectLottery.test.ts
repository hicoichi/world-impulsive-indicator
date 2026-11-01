import { describe, expect, test } from 'vitest'
import { createEffectLottery, NORMAL_EFFECT_COUNT, RARE_RATE } from '../../../app/domain/effectLottery'

function sequence(values: number[]) {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

describe('演出の抽選', () => {
  test('レアは 7%', () => {
    expect(RARE_RATE).toBe(0.07)
    expect(createEffectLottery(sequence([0.069])).draw()).toEqual({ kind: 'rare' })
    expect(createEffectLottery(sequence([0.07, 0])).draw()).toEqual({ kind: 'normal', index: 0 })
  })

  test('通常の演出は4種類から選ぶ', () => {
    expect(NORMAL_EFFECT_COUNT).toBe(4)
    expect(createEffectLottery(sequence([0.5, 0.99])).draw()).toEqual({ kind: 'normal', index: 3 })
  })

  test('直前と同じ通常の演出は選ばない', () => {
    // 2回とも「0番」を引く乱数でも、2回目は別の演出になる
    const lottery = createEffectLottery(sequence([0.5, 0.1, 0.5, 0.1, 0.4]))
    const first = lottery.draw()
    const second = lottery.draw()
    expect(first).toEqual({ kind: 'normal', index: 0 })
    expect(second.kind).toBe('normal')
    expect(second).not.toEqual(first)
  })

  test('多数回引いても、連続して同じ通常の演出にならない', () => {
    const lottery = createEffectLottery()
    let last = -1
    for (let i = 0; i < 2000; i++) {
      const c = lottery.draw()
      if (c.kind !== 'normal') continue
      expect(c.index).not.toBe(last)
      last = c.index
    }
  })
})
