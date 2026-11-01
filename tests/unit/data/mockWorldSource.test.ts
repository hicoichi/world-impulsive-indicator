import { describe, expect, test } from 'vitest'
import { createMockWorldSource } from '../../../app/data/mockWorldSource'

describe('モックの WorldSource', () => {
  test('投票すると集計数が増え、10票で上限になる', async () => {
    const source = createMockWorldSource()
    const before = (await source.fetchState()).ikki.votes
    for (let i = 0; i < 10; i++) expect((await source.submitVote('ikki', `v${i}`)).status).toBe('accepted')
    expect((await source.submitVote('ikki', 'v10')).status).toBe('limit')
    expect((await source.fetchState()).ikki.votes).toBe(before + 10)
    expect((await source.fetchRemaining())?.ikki).toBe(0)
    expect((await source.fetchRemaining())?.exodus).toBe(10)
  })

  test('同じ票 ID は二重に数えない', async () => {
    const source = createMockWorldSource()
    await source.submitVote('festival', 'same')
    expect((await source.submitVote('festival', 'same')).status).toBe('duplicate')
    expect((await source.fetchRemaining())?.festival).toBe(9)
  })

  test('取得した状態を書き換えても、モックの中身は変わらない', async () => {
    const source = createMockWorldSource()
    const state = await source.fetchState()
    state.ikki.regions.kanto = -1
    expect((await source.fetchState()).ikki.regions.kanto).toBeGreaterThan(0)
  })
})
