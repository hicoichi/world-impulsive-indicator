// shared/domain は画面と Lambda の両方が使う。画面のテスト環境ができるまでは、ここで検証する

import { CONTRIBUTION_SCALE, contributionOf, contributionUnitsOf, unitsToContribution } from '../../../shared/domain/contribution'
import { createImpulseRecord, IMPULSE_KEYS, isImpulseKey } from '../../../shared/domain/impulse'
import { createRegionRecord, isRegionKey, REGION_BUCKETS, REGION_KEYS, UNKNOWN_REGION } from '../../../shared/domain/region'
import { activeVotes, hasReachedLimit, remainingVotes, VOTE_LIMIT, VOTE_WINDOW_MS } from '../../../shared/domain/vote'

describe('衝動', () => {
  test('3種類をこの順序で扱う', () => {
    expect(IMPULSE_KEYS).toEqual(['ikki', 'exodus', 'festival'])
    expect(Object.keys(createImpulseRecord(() => 0))).toEqual([...IMPULSE_KEYS])
  })

  test('採用しない衝動は受け付けない', () => {
    expect(isImpulseKey('revolution')).toBe(false)
    expect(isImpulseKey('ikki')).toBe(true)
  })
})

describe('上限とウィンドウ', () => {
  test('上限は100票、ウィンドウは12時間', () => {
    expect(VOTE_LIMIT).toBe(100)
    expect(VOTE_WINDOW_MS).toBe(12 * 60 * 60 * 1000)
  })

  test('100票目は受け付け、101票目は拒否する', () => {
    expect(hasReachedLimit(99)).toBe(false)
    expect(hasReachedLimit(100)).toBe(true)
    expect(remainingVotes(100)).toBe(0)
    expect(remainingVotes(120)).toBe(0)
  })

  test('投票からちょうど12時間で対象外になる', () => {
    const votes = [{ id: 'a', at: 0 }]
    expect(activeVotes(votes, VOTE_WINDOW_MS - 1, VOTE_WINDOW_MS)).toHaveLength(1)
    expect(activeVotes(votes, VOTE_WINDOW_MS, VOTE_WINDOW_MS)).toHaveLength(0)
  })
})

describe('寄与度', () => {
  test('1票目は1、以降は逓減する', () => {
    expect(contributionOf(1)).toBe(1)
    for (let n = 2; n <= VOTE_LIMIT; n++) expect(contributionOf(n)).toBeLessThan(contributionOf(n - 1))
  })

  test('n 票の合計は √n', () => {
    const sum = (n: number) => Array.from({ length: n }, (_, i) => contributionOf(i + 1)).reduce((a, b) => a + b, 0)
    expect(sum(4)).toBeCloseTo(2, 10)
    expect(sum(VOTE_LIMIT)).toBeCloseTo(Math.sqrt(VOTE_LIMIT), 10)
  })

  test('保存用の整数は 1/1000 単位で、上限までの合計の誤差は小さい', () => {
    expect(CONTRIBUTION_SCALE).toBe(1000)
    expect(contributionUnitsOf(1)).toBe(1000)
    const units = Array.from({ length: VOTE_LIMIT }, (_, i) => contributionUnitsOf(i + 1)).reduce((a, b) => a + b, 0)
    // 1票あたりの丸めの誤差は最大 0.0005
    expect(Math.abs(unitsToContribution(units) - Math.sqrt(VOTE_LIMIT))).toBeLessThan(0.0005 * VOTE_LIMIT)
  })

  test.each([0, -1, 1.5, Number.NaN])('票の順番が不正ならエラー（%s）', (n) => {
    expect(() => contributionOf(n)).toThrow(RangeError)
  })
})

describe('地域', () => {
  test('8地方と「不明」', () => {
    expect(REGION_KEYS).toHaveLength(8)
    expect(REGION_BUCKETS).toEqual([...REGION_KEYS, UNKNOWN_REGION])
    expect(Object.keys(createRegionRecord(() => 0))).toEqual([...REGION_BUCKETS])
  })

  test('「不明」や都道府県は地域コードとして受け付けない', () => {
    expect(isRegionKey('kanto')).toBe(true)
    expect(isRegionKey(UNKNOWN_REGION)).toBe(false)
    expect(isRegionKey('tokyo')).toBe(false)
  })
})
