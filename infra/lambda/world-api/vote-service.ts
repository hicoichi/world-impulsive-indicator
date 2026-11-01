// 集計・残り投票枠・投票の処理。上限・ウィンドウ・寄与度の判定は shared/domain を使う

import { contributionUnitsOf, unitsToContribution } from '../../../shared/domain/contribution'
import { createImpulseRecord, IMPULSE_KEYS, type ImpulseKey } from '../../../shared/domain/impulse'
import { createRegionRecord, type RegionBucket } from '../../../shared/domain/region'
import { activeVotes, hasReachedLimit, remainingVotes, type CastVote } from '../../../shared/domain/vote'
import type { ImpulseState } from '../../../shared/domain/worldState'
import { bucketExpiresAt, bucketStart, firstBucketInWindow } from './buckets'
import type { BucketTotals, SessionVotes, VoteStore } from './vote-store'

/** 楽観的ロックの競合時に読み直す回数 */
const MAX_COMMIT_ATTEMPTS = 3

export interface VoteServiceDeps {
  store: VoteStore
  now: () => number
  windowMs: number
}

export type ImpulseCounts = Record<ImpulseKey, number>

export type CastVoteResult
  = | { status: 'accepted' | 'duplicate', remaining: ImpulseCounts }
    | { status: 'limit', remaining: ImpulseCounts }

export class VoteConflictError extends Error {
  constructor() {
    super('投票の保存が競合し続けたため中断した')
  }
}

function toState(totals: BucketTotals): ImpulseState {
  return {
    votes: totals.votes,
    momentum: unitsToContribution(totals.contributionUnits),
    regions: createRegionRecord(bucket => unitsToContribution(totals.regionUnits[bucket])),
  }
}

export async function getState(deps: VoteServiceDeps): Promise<Record<ImpulseKey, ImpulseState>> {
  const from = firstBucketInWindow(deps.now(), deps.windowMs)
  const totals = await Promise.all(IMPULSE_KEYS.map(key => deps.store.sumBuckets(key, from)))
  return createImpulseRecord((key) => {
    const total = totals[IMPULSE_KEYS.indexOf(key)]
    return total ? toState(total) : toState({ votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) })
  })
}

function remainingOf(all: Record<ImpulseKey, SessionVotes>, now: number, windowMs: number): ImpulseCounts {
  return createImpulseRecord(key => remainingVotes(activeVotes(all[key].votes, now, windowMs).length))
}

export async function getRemaining(deps: VoteServiceDeps, sid: string): Promise<ImpulseCounts> {
  const all = await deps.store.getSessionVotes(sid)
  return remainingOf(all, deps.now(), deps.windowMs)
}

/** 最後の票が集計から外れた後に、セッションの記録を消してよい時刻（エポック秒） */
function sessionExpiresAt(votes: readonly CastVote[], windowMs: number): number {
  const latest = Math.max(...votes.map(vote => vote.at))
  return Math.ceil((latest + windowMs) / 1000)
}

export async function castVote(
  deps: VoteServiceDeps,
  sid: string,
  impulse: ImpulseKey,
  voteId: string,
  region: RegionBucket,
): Promise<CastVoteResult> {
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
    const all = await deps.store.getSessionVotes(sid)
    const now = deps.now()
    const current = all[impulse]
    const active = activeVotes(current.votes, now, deps.windowMs)

    // 再送された票は記録済みとして扱い、二重に数えない
    if (active.some(vote => vote.id === voteId)) {
      return { status: 'duplicate', remaining: remainingOf(all, now, deps.windowMs) }
    }
    if (hasReachedLimit(active.length)) {
      return { status: 'limit', remaining: remainingOf(all, now, deps.windowMs) }
    }

    const votes = [...active, { id: voteId, at: now }]
    const start = bucketStart(now)
    const result = await deps.store.commitVote({
      sid,
      impulse,
      votes,
      expectedVersion: current.version,
      sessionExpiresAt: sessionExpiresAt(votes, deps.windowMs),
      bucketStart: start,
      bucketExpiresAt: bucketExpiresAt(start, deps.windowMs),
      // ウィンドウ内の何票目かで寄与度が決まる。古い票が外れれば、次の票の寄与度は戻る
      contributionUnits: contributionUnitsOf(votes.length),
      region,
    })
    if (result === 'committed') {
      const updated = { ...all, [impulse]: { votes, version: current.version + 1 } }
      return { status: 'accepted', remaining: remainingOf(updated, now, deps.windowMs) }
    }
  }
  throw new VoteConflictError()
}
