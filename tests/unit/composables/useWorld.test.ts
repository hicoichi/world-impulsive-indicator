import { afterEach, describe, expect, test, vi } from 'vitest'
import { createImpulseRecord } from '#shared/domain/impulse'
import { createRegionRecord } from '#shared/domain/region'
import { VOTE_LIMIT } from '#shared/domain/vote'
import type { WorldState } from '#shared/domain/worldState'
import { STATE_FRESHNESS_MS, useWorld } from '../../../app/composables/useWorld'
import type { Remaining, SubmitResult, WorldSource } from '../../../app/data/worldSource'

const FULL: Remaining = { ikki: VOTE_LIMIT, exodus: VOTE_LIMIT, festival: VOTE_LIMIT }

function stateWith(votes: number): WorldState {
  return createImpulseRecord(() => ({ votes, momentum: votes, regions: createRegionRecord(() => 0) }))
}

class FakeSource implements WorldSource {
  serverVotes = 100
  remaining: Remaining = { ...FULL }
  failures = 0
  submitted: string[] = []
  regions: (string | null)[] = []
  async fetchState() {
    return stateWith(this.serverVotes)
  }

  async fetchRemaining() {
    return { ...this.remaining }
  }

  async submitVote(impulse: keyof Remaining, voteId: string, region: string | null): Promise<SubmitResult> {
    if (this.failures > 0) {
      this.failures--
      throw new Error('network')
    }
    this.submitted.push(voteId)
    this.regions.push(region)
    if (this.remaining[impulse] <= 0) return { status: 'limit', remaining: { ...this.remaining } }
    this.remaining = { ...this.remaining, [impulse]: this.remaining[impulse] - 1 }
    return { status: 'accepted', remaining: { ...this.remaining } }
  }
}

function setup(region: () => 'kanto' | null = () => null) {
  let clock = 1_000_000
  let id = 0
  const source = new FakeSource()
  const world = useWorld({ source, now: () => clock, random: () => 0.5, createId: () => `v${id++}`, sleep: async () => {}, region })
  return { source, world, advance: (ms: number) => (clock += ms) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useWorld', () => {
  test('取得前は集計数が null、取得後はサーバーの値', async () => {
    const { world } = setup()
    expect(world.views.ikki.value.count).toBeNull()
    await world.refreshState()
    expect(world.views.ikki.value.count).toBe(100)
  })

  test('投票すると即座に +1・残り枠 −1 になり、演出の抽選結果を返す', async () => {
    const { world } = setup()
    await world.refreshState()
    const choice = world.vote('ikki')
    expect(choice?.kind).toBe('normal')
    expect(world.views.ikki.value.count).toBe(101)
    expect(world.views.ikki.value.remaining).toBe(VOTE_LIMIT - 1)
    expect(world.views.exodus.value.count).toBe(100)
  })

  test('受け付けた票は、それを含む集計を取得するまで足し続け、巻き戻らない', async () => {
    const { world, source, advance } = setup()
    await world.refreshState()
    world.vote('ikki')
    await world.settled()
    // まだ集計に含まれていない（キャッシュ中）取得
    await world.refreshState()
    expect(world.views.ikki.value.count).toBe(101)
    // 十分あとに取得した集計には含まれている
    advance(STATE_FRESHNESS_MS + 1)
    source.serverVotes = 101
    await world.refreshState()
    expect(world.views.ikki.value.count).toBe(101)
  })

  test('100票で上限になり、101票目は受け付けない（演出も返さない）', async () => {
    const { world, source } = setup()
    await world.refreshState()
    for (let i = 0; i < VOTE_LIMIT; i++) expect(world.vote('festival')).not.toBeNull()
    expect(world.views.festival.value.limitReached).toBe(true)
    expect(world.vote('festival')).toBeNull()
    await world.settled()
    expect(source.submitted).toHaveLength(VOTE_LIMIT)
    expect(world.views.festival.value.count).toBe(100 + VOTE_LIMIT)
  })

  test('上限は衝動ごとに独立', async () => {
    const { world } = setup()
    for (let i = 0; i < VOTE_LIMIT; i++) world.vote('ikki')
    expect(world.vote('exodus')).not.toBeNull()
  })

  test('通信に失敗したら送り直し、成功すればそのまま', async () => {
    const { world, source } = setup()
    await world.refreshState()
    source.failures = 2
    world.vote('ikki')
    await world.settled()
    expect(source.submitted).toEqual(['v0'])
    expect(world.views.ikki.value.count).toBe(101)
  })

  test('送り直しても確定しなければ、+1 と残り枠を静かに戻す', async () => {
    const { world, source } = setup()
    await world.refreshState()
    source.failures = 3
    world.vote('ikki')
    await world.settled()
    expect(world.views.ikki.value.count).toBe(100)
    expect(world.views.ikki.value.remaining).toBe(VOTE_LIMIT)
  })

  test('サーバーが上限と答えた票は取り消し、残り枠をサーバーに合わせる', async () => {
    const { world, source } = setup()
    await world.refreshState()
    source.remaining = { ...FULL, ikki: 0 }
    world.vote('ikki')
    await world.settled()
    expect(world.views.ikki.value.count).toBe(100)
    expect(world.views.ikki.value.limitReached).toBe(true)
  })

  test('押した時点の地方を付けて送り、使わないときは地方なし', async () => {
    let current: 'kanto' | null = 'kanto'
    const { world, source } = setup(() => current)
    world.vote('ikki')
    current = null
    world.vote('ikki')
    await world.settled()
    expect(source.regions).toEqual(['kanto', null])
  })

  test('起動時に残り枠を取得する', async () => {
    const { world, source } = setup()
    source.remaining = { ...FULL, exodus: 3 }
    await world.refreshRemaining()
    expect(world.views.exodus.value.remaining).toBe(3)
  })

  test('一定間隔で集計を取り直す', async () => {
    vi.useFakeTimers()
    const { world, source } = setup()
    world.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(world.views.ikki.value.count).toBe(100)
    source.serverVotes = 150
    await vi.advanceTimersByTimeAsync(10_000)
    expect(world.views.ikki.value.count).toBe(150)
    world.stop()
  })

  test('集計の寄与度から演出の強さを決める（表示する数値とは別）', async () => {
    const { world } = setup()
    expect(world.views.ikki.value.visual.activity).toBe(0)
    await world.refreshState()
    expect(world.views.ikki.value.visual.activity).toBeGreaterThan(0)
  })
})
