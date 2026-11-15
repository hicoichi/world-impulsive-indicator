import { describe, expect, test } from 'vitest'
import { emptyImpulseState, parseTargetState, parseWorldState } from '#shared/domain/worldState'

const regions = { hokkaido: 0, tohoku: 0, kanto: 1.5, chubu: 0, kinki: 0, chugoku: 0, shikoku: 0, kyushu: 0, unknown: 2 }
const valid = {
  impulses: {
    ikki: { votes: 3, momentum: 3.5, regions },
    exodus: { votes: 0, momentum: 0, regions },
    festival: { votes: 1, momentum: 1, regions },
  },
}

describe('parseWorldState', () => {
  test('正しい応答を読める', () => {
    const state = parseWorldState(valid)
    expect(state?.ikki).toEqual({ votes: 3, momentum: 3.5, regions })
  })

  test.each([
    ['null', null],
    ['impulses がない', {}],
    ['衝動が欠けている', { impulses: { ikki: valid.impulses.ikki } }],
    ['数値でない', { impulses: { ...valid.impulses, ikki: { votes: '3', momentum: 1, regions } } }],
    ['地域が欠けている', { impulses: { ...valid.impulses, ikki: { votes: 3, momentum: 1, regions: { kanto: 1 } } } }],
  ])('形が違えば null（%s）', (_, body) => {
    expect(parseWorldState(body)).toBeNull()
  })

  test('負の値は 0 にする', () => {
    const state = parseWorldState({ impulses: { ...valid.impulses, ikki: { votes: -1, momentum: -2, regions } } })
    expect(state?.ikki.votes).toBe(0)
    expect(state?.ikki.momentum).toBe(0)
  })

  test('空の状態', () => {
    expect(emptyImpulseState().votes).toBe(0)
  })
})

describe('parseTargetState（評価対象ごと。docs/world-api-design.md §8）', () => {
  const keys = ['ikki', 'pack', 'settle'] as const
  const kannami = { impulses: { ikki: { votes: 1, momentum: 1 }, pack: { votes: 0, momentum: 0 }, settle: { votes: 2, momentum: 1.4 } } }

  test('地域の分布なしで読める', () => {
    expect(parseTargetState(kannami, keys, false)).toEqual(kannami.impulses)
  })

  test('衝動が欠けていれば null', () => {
    expect(parseTargetState({ impulses: { ikki: { votes: 1, momentum: 1 } } }, keys, false)).toBeNull()
  })

  test('地域の分布が必須の対象で、分布がなければ null', () => {
    expect(parseTargetState(kannami, keys, true)).toBeNull()
  })

  test('オリジナル版の応答は、地域の分布つきで読める', () => {
    expect(parseTargetState(valid, ['ikki', 'exodus', 'festival'], true)?.ikki).toEqual({ votes: 3, momentum: 3.5, regions })
  })

  test('負の値は 0 に丸める', () => {
    const negative = { impulses: { ...kannami.impulses, ikki: { votes: -5, momentum: -1 } } }
    expect(parseTargetState(negative, keys, false)?.ikki).toEqual({ votes: 0, momentum: 0 })
  })
})
