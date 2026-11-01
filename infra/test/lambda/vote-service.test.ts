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
  for (let i = 0; i < times; i++) await castVote(deps, sid, 'ikki', `${prefix}${i}`, 'unknown')
}

describe('castVote', () => {
  test('受け付けると集計と残り枠に反映される', async () => {
    const { deps } = setup()
    const result = await castVote(deps, 's1', 'ikki', 'v1', 'kanto')
    expect(result).toEqual({ status: 'accepted', remaining: { ikki: 9, exodus: 10, festival: 10 } })
    const state = await getState(deps)
    expect(state.ikki.votes).toBe(1)
    expect(state.ikki.momentum).toBe(1)
    expect(state.ikki.regions.kanto).toBe(1)
  })

  test('10票目は受け付け、11票目は上限', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', 10)
    expect((await getRemaining(deps, 's1')).ikki).toBe(0)
    const result = await castVote(deps, 's1', 'ikki', 'v10', 'unknown')
    expect(result.status).toBe('limit')
    expect((await getState(deps)).ikki.votes).toBe(10)
  })

  test('上限はセッションごと・衝動ごとに独立', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', 10)
    expect((await castVote(deps, 's1', 'exodus', 'e1', 'unknown')).status).toBe('accepted')
    expect((await castVote(deps, 's2', 'ikki', 'x1', 'unknown')).status).toBe('accepted')
  })

  test('衝動ごとに独立して集計する', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'festival', 'f1', 'kinki')
    const state = await getState(deps)
    expect(state.festival.votes).toBe(1)
    expect(state.ikki.votes).toBe(0)
    expect(state.exodus.momentum).toBe(0)
  })

  test('同じ票 ID は二重に数えない', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'ikki', 'same', 'unknown')
    const result = await castVote(deps, 's1', 'ikki', 'same', 'unknown')
    expect(result.status).toBe('duplicate')
    expect((await getState(deps)).ikki.votes).toBe(1)
    expect((await getRemaining(deps, 's1')).ikki).toBe(9)
  })

  test('12時間で枠が回復する', async () => {
    const { deps, advance } = setup()
    await voteTimes(deps, 's1', 10)
    advance(WINDOW)
    expect((await getRemaining(deps, 's1')).ikki).toBe(10)
    expect((await castVote(deps, 's1', 'ikki', 'again', 'unknown')).status).toBe('accepted')
  })

  test('競合したら読み直して保存する', async () => {
    const { deps, store } = setup()
    store.forcedConflicts = 2
    expect((await castVote(deps, 's1', 'ikki', 'v1', 'unknown')).status).toBe('accepted')
    expect((await getState(deps)).ikki.votes).toBe(1)
  })

  test('競合が続いたら中断する', async () => {
    const { deps, store } = setup()
    store.forcedConflicts = 3
    await expect(castVote(deps, 's1', 'ikki', 'v1', 'unknown')).rejects.toBeInstanceOf(VoteConflictError)
    expect((await getState(deps)).ikki.votes).toBe(0)
  })
})

describe('寄与度', () => {
  test('1人の10票は寄与度の合計が約 √10 になり、票数は10のまま', async () => {
    const { deps } = setup()
    await voteTimes(deps, 's1', 10)
    const state = await getState(deps)
    expect(state.ikki.votes).toBe(10)
    expect(state.ikki.momentum).toBeCloseTo(Math.sqrt(10), 2)
  })

  test('10人の1票ずつは寄与度の合計が10になる', async () => {
    const { deps } = setup()
    for (let i = 0; i < 10; i++) await castVote(deps, `s${i}`, 'ikki', 'v1', 'unknown')
    expect((await getState(deps)).ikki.momentum).toBe(10)
  })

  test('古い票が外れたあとの票は、再び大きな寄与度になる', async () => {
    const { deps, store, advance } = setup()
    await castVote(deps, 's1', 'ikki', 'v1', 'unknown')
    await castVote(deps, 's1', 'ikki', 'v2', 'unknown')
    advance(WINDOW)
    await castVote(deps, 's1', 'ikki', 'v3', 'unknown')
    // 集計の枠は最大5分遅れて外れるため、合計ではなく新しい枠に加算された寄与度で確かめる
    const latest = [...store.buckets.values()].at(-1)
    expect(latest?.contributionUnits).toBe(1000)
  })
})

describe('地域', () => {
  test('地域ごとに寄与度を加算し、地域なしは unknown に入る', async () => {
    const { deps } = setup()
    await castVote(deps, 's1', 'exodus', 'v1', 'kyushu')
    await castVote(deps, 's1', 'exodus', 'v2', 'kyushu')
    await castVote(deps, 's2', 'exodus', 'v1', 'unknown')
    const { regions, momentum } = (await getState(deps)).exodus
    expect(regions.kyushu).toBeCloseTo(Math.sqrt(2), 2)
    expect(regions.unknown).toBe(1)
    expect(regions.kanto).toBe(0)
    const sum = Object.values(regions).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(momentum, 5)
  })

  test('セッションの記録に地域を残さない', async () => {
    const { deps, store } = setup()
    await castVote(deps, 's1', 'ikki', 'v1', 'hokkaido')
    expect(JSON.stringify([...store.sessions.values()])).not.toContain('hokkaido')
  })
})

describe('getState（ローリングウィンドウ）', () => {
  test('直近12時間の票を合計し、それより古い枠は含めない', async () => {
    const { deps, advance } = setup()
    await castVote(deps, 'old', 'exodus', 'o1', 'unknown')
    advance(6 * HOUR)
    await castVote(deps, 'new', 'exodus', 'n1', 'unknown')
    expect((await getState(deps)).exodus.votes).toBe(2)
    // 最初の票から12時間＋5分（1枠）経てば、最初の票は外れる
    advance(6 * HOUR + 5 * 60 * 1000)
    const state = await getState(deps)
    expect(state.exodus.votes).toBe(1)
    expect(state.exodus.momentum).toBe(1)
  })
})
