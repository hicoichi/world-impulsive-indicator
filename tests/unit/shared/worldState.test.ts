import { describe, expect, test } from 'vitest'
import { emptyImpulseState, parseWorldState } from '#shared/domain/worldState'

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
