// テスト用のメモリ上の VoteStore。版の一致を確かめ、DynamoDB と同じく競合を返す

import { createRegionRecord, type RegionBucket } from '../../../shared/domain/region'
import { createTargetImpulseRecord, type TargetKey } from '../../../shared/domain/target'
import type { BucketTotals, CommitVoteInput, CommitVoteResult, SessionVotes, VoteStore } from '../../lambda/world-api/vote-store'

interface Bucket {
  target: TargetKey
  impulse: string
  start: number
  votes: number
  contributionUnits: number
  /** 地域を受け取った票だけが加算される。位置情報を使わない対象では空のまま */
  regionUnits: Partial<Record<RegionBucket, number>>
}

export class MemoryVoteStore implements VoteStore {
  /** `${セッション}#${対象}#${衝動}` → 投票記録 */
  readonly sessions = new Map<string, SessionVotes>()
  /** `${対象}#${衝動}#${枠の開始時刻}` → 枠の合計 */
  readonly buckets = new Map<string, Bucket>()
  /** 次の commitVote で強制的に競合させる回数 */
  forcedConflicts = 0

  async getSessionVotes(sid: string, target: TargetKey) {
    return createTargetImpulseRecord<SessionVotes>(target, (impulse) => {
      const stored = this.sessions.get(`${sid}#${target}#${impulse}`)
      return { votes: [...(stored?.votes ?? [])], version: stored?.version ?? 0 }
    })
  }

  async commitVote(input: CommitVoteInput): Promise<CommitVoteResult> {
    if (this.forcedConflicts > 0) {
      this.forcedConflicts--
      return 'conflict'
    }
    const sessionKey = `${input.sid}#${input.target}#${input.impulse}`
    if ((this.sessions.get(sessionKey)?.version ?? 0) !== input.expectedVersion) return 'conflict'
    this.sessions.set(sessionKey, { votes: [...input.votes], version: input.expectedVersion + 1 })

    const key = `${input.target}#${input.impulse}#${input.bucketStart}`
    const bucket = this.buckets.get(key)
      ?? { target: input.target, impulse: input.impulse, start: input.bucketStart, votes: 0, contributionUnits: 0, regionUnits: {} }
    bucket.votes += 1
    bucket.contributionUnits += input.contributionUnits
    if (input.region !== null) bucket.regionUnits[input.region] = (bucket.regionUnits[input.region] ?? 0) + input.contributionUnits
    this.buckets.set(key, bucket)
    return 'committed'
  }

  async sumBuckets(target: TargetKey, impulse: string, fromBucket: number): Promise<BucketTotals> {
    const totals: BucketTotals = { votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) }
    for (const bucket of this.buckets.values()) {
      if (bucket.target !== target || bucket.impulse !== impulse || bucket.start < fromBucket) continue
      totals.votes += bucket.votes
      totals.contributionUnits += bucket.contributionUnits
      totals.regionUnits = createRegionRecord(region => totals.regionUnits[region] + (bucket.regionUnits[region] ?? 0))
    }
    return totals
  }
}
