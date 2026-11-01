// テスト用のメモリ上の VoteStore。版の一致を確かめ、DynamoDB と同じく競合を返す

import { createImpulseRecord, type ImpulseKey } from '../../../shared/domain/impulse'
import { createRegionRecord, type RegionBucket } from '../../../shared/domain/region'
import type { BucketTotals, CommitVoteInput, CommitVoteResult, SessionVotes, VoteStore } from '../../lambda/world-api/vote-store'

interface Bucket {
  impulse: ImpulseKey
  start: number
  votes: number
  contributionUnits: number
  regionUnits: Record<RegionBucket, number>
}

export class MemoryVoteStore implements VoteStore {
  readonly sessions = new Map<string, Record<ImpulseKey, SessionVotes>>()
  /** `${衝動}#${枠の開始時刻}` → 枠の合計 */
  readonly buckets = new Map<string, Bucket>()
  /** 次の commitVote で強制的に競合させる回数 */
  forcedConflicts = 0

  async getSessionVotes(sid: string) {
    const stored = this.sessions.get(sid)
    return createImpulseRecord<SessionVotes>(key => ({
      votes: [...(stored?.[key].votes ?? [])],
      version: stored?.[key].version ?? 0,
    }))
  }

  async commitVote(input: CommitVoteInput): Promise<CommitVoteResult> {
    if (this.forcedConflicts > 0) {
      this.forcedConflicts--
      return 'conflict'
    }
    const session = this.sessions.get(input.sid) ?? createImpulseRecord<SessionVotes>(() => ({ votes: [], version: 0 }))
    if (session[input.impulse].version !== input.expectedVersion) return 'conflict'
    session[input.impulse] = { votes: [...input.votes], version: input.expectedVersion + 1 }
    this.sessions.set(input.sid, session)

    const key = `${input.impulse}#${input.bucketStart}`
    const bucket = this.buckets.get(key)
      ?? { impulse: input.impulse, start: input.bucketStart, votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) }
    bucket.votes += 1
    bucket.contributionUnits += input.contributionUnits
    bucket.regionUnits[input.region] += input.contributionUnits
    this.buckets.set(key, bucket)
    return 'committed'
  }

  async sumBuckets(impulse: ImpulseKey, fromBucket: number): Promise<BucketTotals> {
    const totals: BucketTotals = { votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) }
    for (const bucket of this.buckets.values()) {
      if (bucket.impulse !== impulse || bucket.start < fromBucket) continue
      totals.votes += bucket.votes
      totals.contributionUnits += bucket.contributionUnits
      totals.regionUnits = createRegionRecord(region => totals.regionUnits[region] + bucket.regionUnits[region])
    }
    return totals
  }
}
