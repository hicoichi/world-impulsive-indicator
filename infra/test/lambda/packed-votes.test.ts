import { VOTE_LIMIT } from '../../../shared/domain/vote'
import { packVotes, unpackVotes } from '../../lambda/world-api/packed-votes'

const AT = 1_800_000_000_000

describe('投票記録を詰めた文字列', () => {
  test('詰めて読み戻すと、ID と時刻（秒）が戻る', () => {
    const votes = [{ id: 'aB3x_9Qz', at: AT }, { id: 'Zk2m-Pq1', at: AT + 5_000 }]
    const packed = packVotes(votes)
    expect(packed).toMatch(/^aB3x_9Qz\.[0-9a-z]+,Zk2m-Pq1\.[0-9a-z]+$/)
    expect(unpackVotes(packed)).toEqual(votes)
  })

  test('時刻は秒に切り捨てる', () => {
    expect(unpackVotes(packVotes([{ id: 'v', at: AT + 999 }]))).toEqual([{ id: 'v', at: AT }])
  })

  test('空なら空', () => {
    expect(packVotes([])).toBe('')
    expect(unpackVotes('')).toEqual([])
  })

  test('壊れた部分は無視する', () => {
    expect(unpackVotes('ok.t3k1q0,,no-time.,.t3k1q0,bad id.t3k1q0,x.y.z,neg.-1')).toEqual([{ id: 'ok', at: Number.parseInt('t3k1q0', 36) * 1000 }])
  })

  test('長い ID（古い画面の UUID）も扱える', () => {
    const votes = [{ id: '3f2a9c1e-8b7d-4e21-9a0f-5c6d7e8f9a0b', at: AT }]
    expect(unpackVotes(packVotes(votes))).toEqual(votes)
  })

  test('上限いっぱいでも小さい（画面の8文字の ID で 2KB 未満）', () => {
    const votes = Array.from({ length: VOTE_LIMIT }, (_, i) => ({ id: `Ab3x_9Q${i % 10}`, at: AT + i * 1000 }))
    expect(Buffer.byteLength(packVotes(votes), 'utf8')).toBeLessThan(2048)
  })
})
