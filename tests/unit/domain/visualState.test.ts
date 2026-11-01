import { describe, expect, test } from 'vitest'
import { createRegionRecord } from '#shared/domain/region'
import { activityOf, BASE_HEAT, FULL_ACTIVITY_MOMENTUM, IDLE_VISUAL, LABELED_REGIONS, visualOf } from '../../../app/domain/visualState'

const regions = (values: Partial<Record<string, number>>) => createRegionRecord(bucket => values[bucket] ?? 0)

describe('activityOf（にぎわい）', () => {
  test('票がなければ 0、上限の寄与度で 1、それ以上は増えない', () => {
    expect(activityOf(0)).toBe(0)
    expect(activityOf(FULL_ACTIVITY_MOMENTUM)).toBe(1)
    expect(activityOf(FULL_ACTIVITY_MOMENTUM * 10)).toBe(1)
  })

  test('最初の数票でもはっきり増え、伸びは緩やかになる（非線形）', () => {
    expect(activityOf(10)).toBeGreaterThan(0.25)
    expect(activityOf(20) - activityOf(10)).toBeGreaterThan(activityOf(2010) - activityOf(2000))
  })
})

describe('visualOf', () => {
  test('票がなければ全国が基本の熱で、ラベルはない', () => {
    const v = visualOf(0, regions({}))
    expect(Object.values(v.heat).every(h => h === BASE_HEAT)).toBe(true)
    expect(v.labeled).toEqual([])
  })

  test('寄与度の大きい地方ほど熱く、最大の地方が最も熱い', () => {
    const v = visualOf(100, regions({ kanto: 60, kinki: 30, kyushu: 10 }))
    expect(v.heat.kanto).toBeGreaterThan(v.heat.kinki)
    expect(v.heat.kinki).toBeGreaterThan(v.heat.kyushu)
    expect(v.heat.kyushu).toBeGreaterThan(v.heat.shikoku)
    expect(v.heat.shikoku).toBe(BASE_HEAT)
  })

  test('地域なしの票は全国に均等に配る', () => {
    const v = visualOf(80, regions({ unknown: 80 }))
    const values = Object.values(v.heat)
    expect(new Set(values).size).toBe(1)
    expect(values[0]).toBeGreaterThan(BASE_HEAT)
  })

  test('熱は 0〜1 に収まる', () => {
    const v = visualOf(1e9, regions({ kanto: 1e9 }))
    expect(Math.max(...Object.values(v.heat))).toBeLessThanOrEqual(1)
  })

  test('ラベルは票のある地方だけ、多い順に最大5つ（Q-18）', () => {
    const v = visualOf(100, regions({ kanto: 9, kinki: 8, chubu: 7, kyushu: 6, tohoku: 5, hokkaido: 4, unknown: 50 }))
    expect(LABELED_REGIONS).toBe(5)
    expect(v.labeled).toEqual(['kanto', 'kinki', 'chubu', 'kyushu', 'tohoku'])
    expect(visualOf(10, regions({ shikoku: 1 })).labeled).toEqual(['shikoku'])
  })

  test('未取得のときは基本の見た目', () => {
    expect(IDLE_VISUAL.activity).toBe(0)
    expect(IDLE_VISUAL.labeled).toEqual([])
  })
})
