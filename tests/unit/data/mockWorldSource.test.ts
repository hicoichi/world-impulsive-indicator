import { describe, expect, test } from 'vitest'
import { createMockWorldSource } from '../../../app/data/mockWorldSource'

describe('モックの WorldSource', () => {
  test('投票すると集計数が増え、10票で上限になる', async () => {
    const source = createMockWorldSource()
    const before = (await source.fetchState()).ikki.votes
    for (let i = 0; i < 10; i++) expect((await source.submitVote('ikki', `v${i}`, null)).status).toBe('accepted')
    expect((await source.submitVote('ikki', 'v10', null)).status).toBe('limit')
    expect((await source.fetchState()).ikki.votes).toBe(before + 10)
    expect((await source.fetchRemaining())?.ikki).toBe(0)
    expect((await source.fetchRemaining())?.exodus).toBe(10)
  })

  test('同じ票 ID は二重に数えない', async () => {
    const source = createMockWorldSource()
    await source.submitVote('festival', 'same', null)
    expect((await source.submitVote('festival', 'same', null)).status).toBe('duplicate')
    expect((await source.fetchRemaining())?.festival).toBe(9)
  })

  test('地方を付けた票は、その地方の寄与度に入る', async () => {
    const source = createMockWorldSource()
    const before = (await source.fetchState()).exodus.regions.shikoku
    await source.submitVote('exodus', 'v1', 'shikoku')
    expect((await source.fetchState()).exodus.regions.shikoku).toBe(before + 1)
  })

  test('取得した状態を書き換えても、モックの中身は変わらない', async () => {
    const source = createMockWorldSource()
    const state = await source.fetchState()
    state.ikki.regions.kanto = -1
    expect((await source.fetchState()).ikki.regions.kanto).toBeGreaterThan(0)
  })
})
