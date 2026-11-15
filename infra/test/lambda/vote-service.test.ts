import { VOTE_LIMIT } from '../../../shared/domain/vote'
import { castVote, getRemaining, getState, VoteConflictError, type VoteServiceDeps } from '../../lambda/world-api/vote-service'
import { MemoryVoteStore } from './memory-vote-store'

const HOUR = 60 * 60 * 1000
const WINDOW = 12 * HOUR

function setup(start = 1_800_000_000_000) {
  let current = start
  const store = new MemoryVoteStore()
  const deps: VoteServiceDeps = { store, now: () => current, windowMs: WINDOW }
  const advance = (ms: number) => {
    current += ms
  }
  return { store, deps, advance }
}

async function voteTimes(deps: VoteServiceDeps, sid: string, times: number, prefix = 'v') {
  for (let i = 0; i < times; i++) await castVote(deps, sid, 'world', 'ikki', `${prefix}${i}`, 'unknown')
}

describe('castVote', () => {
  test('受け付けると集計と残り枠に反映される', async () => {
    const { deps } = setup()
    const result = await castVote(deps, 's1', 'world', 'ikki', 'v1', 'kanto')
    expect(result).toEqual({ status: 'accepted', remaining: { ikki: VOTE_LIMIT - 1, exodus: VOTE_LIMIT, festival: VOTE_LIMIT } })
    const state = await getState(deps, 'world')
    expect(state.ikki.votes).toBe(1)
    expect(state.ikki.momentum).toBe(1)
    expect(state.ikki.regions?.kanto).toBe(1)
  })

  test('100票目は受け付け、101票目は上限', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', VOTE_LIMIT)
    expect((await getRemaining(deps, 's1', 'world')).ikki).toBe(0)
    const result = await castVote(deps, 's1', 'world', 'ikki', 'over', 'unknown')
    expect(result.status).toBe('limit')
    expect((await getState(deps, 'world')).ikki.votes).toBe(VOTE_LIMIT)
  })

  test('上限はセッションごと・衝動ごとに独立', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', VOTE_LIMIT)
    expect((await castVote(deps, 's1', 'world', 'exodus', 'e1', 'unknown')).status).toBe('accepted')
    expect((await castVote(deps, 's2', 'world', 'ikki', 'x1', 'unknown')).status).toBe('accepted')
  })

  test('衝動ごとに独立して集計する', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'world', 'festival', 'f1', 'kinki')
    const state = await getState(deps, 'world')
    expect(state.festival.votes).toBe(1)
    expect(state.ikki.votes).toBe(0)
    expect(state.exodus.momentum).toBe(0)
  })

  test('同じ票 ID は二重に数えない', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'world', 'ikki', 'same', 'unknown')
    const result = await castVote(deps, 's1', 'world', 'ikki', 'same', 'unknown')
    expect(result.status).toBe('duplicate')
    expect((await getState(deps, 'world')).ikki.votes).toBe(1)
    expect((await getRemaining(deps, 's1', 'world')).ikki).toBe(VOTE_LIMIT - 1)
  })

  test('12時間で枠が回復する', async () => {
    const { deps, advance } = setup()
    await voteTimes(deps, 's1', VOTE_LIMIT)
    advance(WINDOW)
    expect((await getRemaining(deps, 's1', 'world')).ikki).toBe(VOTE_LIMIT)
    expect((await castVote(deps, 's1', 'world', 'ikki', 'again', 'unknown')).status).toBe('accepted')
  })

  test('競合したら読み直して保存する', async () => {
    const { deps, store } = setup()
    store.forcedConflicts = 2
    expect((await castVote(deps, 's1', 'world', 'ikki', 'v1', 'unknown')).status).toBe('accepted')
    expect((await getState(deps, 'world')).ikki.votes).toBe(1)
  })

  test('競合が続いたら中断する', async () => {
    const { deps, store } = setup()
    store.forcedConflicts = 3
    await expect(castVote(deps, 's1', 'world', 'ikki', 'v1', 'unknown')).rejects.toBeInstanceOf(VoteConflictError)
    expect((await getState(deps, 'world')).ikki.votes).toBe(0)
  })
})

describe('寄与度', () => {
  test('1人の上限いっぱいの票は寄与度の合計が √上限 になり、票数はそのまま', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', VOTE_LIMIT)
    const state = await getState(deps, 'world')
    expect(state.ikki.votes).toBe(VOTE_LIMIT)
    expect(state.ikki.momentum).toBeCloseTo(Math.sqrt(VOTE_LIMIT), 1)
  })

  test('10人の1票ずつは寄与度の合計が10になる', async () => {
    const { deps } = setup()
    for (let i = 0; i < 10; i++) await castVote(deps, `s${i}`, 'world', 'ikki', 'v1', 'unknown')
    expect((await getState(deps, 'world')).ikki.momentum).toBe(10)
  })

  test('古い票が外れたあとの票は、再び大きな寄与度になる', async () => {
    const { deps, store, advance } = setup()
    await castVote(deps, 's1', 'world', 'ikki', 'v1', 'unknown')
    await castVote(deps, 's1', 'world', 'ikki', 'v2', 'unknown')
    advance(WINDOW)
    await castVote(deps, 's1', 'world', 'ikki', 'v3', 'unknown')
    // 集計の枠は最大5分遅れて外れるため、合計ではなく新しい枠に加算された寄与度で確かめる
    const latest = [...store.buckets.values()].at(-1)
    expect(latest?.contributionUnits).toBe(1000)
  })
})

describe('地域', () => {
  test('地域ごとに寄与度を加算し、地域なしは unknown に入る', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'world', 'exodus', 'v1', 'kyushu')
    await castVote(deps, 's1', 'world', 'exodus', 'v2', 'kyushu')
    await castVote(deps, 's2', 'world', 'exodus', 'v1', 'unknown')
    const { regions, momentum } = (await getState(deps, 'world')).exodus
    if (!regions) throw new Error('オリジナル版には地域の分布がある')
    expect(regions.kyushu).toBeCloseTo(Math.sqrt(2), 2)
    expect(regions.unknown).toBe(1)
    expect(regions.kanto).toBe(0)
    const sum = Object.values(regions).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(momentum, 5)
  })

  test('セッションの記録に地域を残さない', async () => {
    const { deps, store } = setup()
    await castVote(deps, 's1', 'world', 'ikki', 'v1', 'hokkaido')
    expect(JSON.stringify([...store.sessions.values()])).not.toContain('hokkaido')
  })
})

describe('getState（ローリングウィンドウ）', () => {
  test('直近12時間の票を合計し、それより古い枠は含めない', async () => {
    const { deps, advance } = setup()
    await castVote(deps, 'old', 'world', 'exodus', 'o1', 'unknown')
    advance(6 * HOUR)
    await castVote(deps, 'new', 'world', 'exodus', 'n1', 'unknown')
    expect((await getState(deps, 'world')).exodus.votes).toBe(2)
    // 最初の票から12時間＋5分（1枠）経てば、最初の票は外れる
    advance(6 * HOUR + 5 * 60 * 1000)
    const state = await getState(deps, 'world')
    expect(state.exodus.votes).toBe(1)
    expect(state.exodus.momentum).toBe(1)
  })
})

describe('評価対象（函南町版）', () => {
  test('衝動は 一揆したい・荷物をまとめたい・骨を埋めたい の順で、地域の分布を持たない', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'kannami', 'settle', 'v1', null)
    const state = await getState(deps, 'kannami')
    expect(Object.keys(state)).toEqual(['ikki', 'pack', 'settle'])
    expect(state.settle).toEqual({ votes: 1, momentum: 1 })
    expect(state.ikki).toEqual({ votes: 0, momentum: 0 })
  })

  test('同じ「一揆したい」でも、オリジナル版と函南町版の集計は混ざらない', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'kannami', 'ikki', 'v1', null)
    await castVote(deps, 's1', 'kannami', 'ikki', 'v2', null)
    await castVote(deps, 's1', 'world', 'ikki', 'v3', 'kanto')
    expect((await getState(deps, 'kannami')).ikki.votes).toBe(2)
    expect((await getState(deps, 'world')).ikki.votes).toBe(1)
  })

  test('上限は対象ごとに独立する（オリジナル版で上限に達しても函南町版は投票できる）', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', VOTE_LIMIT)
    expect((await getRemaining(deps, 's1', 'world')).ikki).toBe(0)
    expect(await getRemaining(deps, 's1', 'kannami')).toEqual({ settle: VOTE_LIMIT, ikki: VOTE_LIMIT, pack: VOTE_LIMIT })
    expect((await castVote(deps, 's1', 'kannami', 'ikki', 'k1', null)).status).toBe('accepted')
  })

  test('函南町版の100票目は受け付け、101票目は上限', async () => {
    const { deps } = setup()
    for (let i = 0; i < VOTE_LIMIT; i++) await castVote(deps, 's1', 'kannami', 'pack', `p${i}`, null)
    const result = await castVote(deps, 's1', 'kannami', 'pack', 'over', null)
    expect(result).toEqual({ status: 'limit', remaining: { settle: VOTE_LIMIT, ikki: VOTE_LIMIT, pack: 0 } })
    const state = await getState(deps, 'kannami')
    expect(state.pack.votes).toBe(VOTE_LIMIT)
    expect(state.pack.momentum).toBeCloseTo(Math.sqrt(VOTE_LIMIT), 1)
  })

  test('位置情報を使わない対象では、地域を渡されても保存しない', async () => {
    const { deps, store } = setup()
    await castVote(deps, 's1', 'kannami', 'settle', 'v1', 'kanto')
    expect([...store.buckets.values()][0]?.regionUnits).toEqual({})
  })
})
