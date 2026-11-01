import { describe, expect, test } from 'vitest'
import { createScheduler, MAX_TIMERS, trimEffects } from '../../../app/visuals/scheduler'

describe('演出の予約', () => {
  test('時刻が来たら、予約した順に1回だけ実行する', () => {
    const s = createScheduler()
    const fired: string[] = []
    s.schedule(0, 0.5, () => fired.push('b'))
    s.schedule(0, 0.2, () => fired.push('a'))
    s.run(0.1)
    expect(fired).toEqual([])
    s.run(0.6)
    expect(fired).toEqual(['b', 'a'])
    s.run(1)
    expect(fired).toEqual(['b', 'a'])
    expect(s.size).toBe(0)
  })

  test('祭りのレアの演出のように予約が多くても、最初の予約（「祭」の花火）が消えない', () => {
    const s = createScheduler()
    const fired: string[] = []
    s.schedule(0, 0.9, () => fired.push('祭'))
    for (let k = 0; k < 26; k++) s.schedule(0, 0.2 + k * 0.14, () => fired.push('花火'))
    for (let k = 0; k < 7; k++) s.schedule(0, 3.2 + k * 0.25, () => fired.push('柳'))
    s.run(10)
    expect(fired).toContain('祭')
    expect(fired).toHaveLength(34)
  })

  test('実行中に入れた予約は、次の時刻以降に実行する', () => {
    const s = createScheduler()
    const fired: number[] = []
    s.schedule(0, 0.1, () => s.schedule(0.1, 0.1, () => fired.push(2)))
    s.run(0.15)
    expect(fired).toEqual([])
    s.run(0.25)
    expect(fired).toEqual([2])
  })

  test('連打しても予約は上限までしかためない', () => {
    const s = createScheduler()
    for (let i = 0; i < MAX_TIMERS + 50; i++) s.schedule(0, 1, () => {})
    expect(s.size).toBe(MAX_TIMERS)
  })
})

describe('演出の間引き', () => {
  test('上限を超えたら古いものから間引く', () => {
    const effects = [1, 2, 3, 4, 5].map(id => ({ id }))
    trimEffects(effects, 3)
    expect(effects.map(e => e.id)).toEqual([3, 4, 5])
  })

  test('レアの主役は、他を間引いて足りるなら残す（レアの直後の連打で消えない）', () => {
    const effects = [{ id: 'flag', keep: true }, ...[1, 2, 3, 4].map(id => ({ id: String(id) }))]
    trimEffects(effects, 3)
    expect(effects.map(e => e.id)).toEqual(['flag', '3', '4'])
  })

  test('主役だけで上限を超えるときは、古い主役から間引く', () => {
    const effects = [1, 2, 3].map(id => ({ id, keep: true }))
    trimEffects(effects, 2)
    expect(effects.map(e => e.id)).toEqual([2, 3])
  })
})
