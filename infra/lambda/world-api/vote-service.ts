// 集計・残り投票枠・投票の処理。上限・ウィンドウ・寄与度の判定は shared/domain を使う
// 集計と上限は「評価対象 × 衝動」ごとに独立する（docs/world-api-design.md §8）

import { contributionUnitsOf, unitsToContribution } from '../../../shared/domain/contribution'
import { createRegionRecord, type RegionBucket } from '../../../shared/domain/region'
import { createTargetImpulseRecord, TARGETS, type TargetKey } from '../../../shared/domain/target'
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

/** 衝動ごとの値。キーはその対象の衝動 */
export type ImpulseCounts = Record<string, number>

/** 集計状態。位置情報を使わない対象では地域の分布を持たない */
export type TargetImpulseState = Omit<ImpulseState, 'regions'> & Partial<Pick<ImpulseState, 'regions'>>

export type CastVoteResult
  = | { status: 'accepted' | 'duplicate', remaining: ImpulseCounts }
    | { status: 'limit', remaining: ImpulseCounts }

export class VoteConflictError extends Error {
  constructor() {
    super('投票の保存が競合し続けたため中断した')
  }
}

const EMPTY_SESSION: SessionVotes = { votes: [], version: 0 }

function toState(totals: BucketTotals, usesRegion: boolean): TargetImpulseState {
  const state = { votes: totals.votes, momentum: unitsToContribution(totals.contributionUnits) }
  if (!usesRegion) return state
  return { ...state, regions: createRegionRecord(bucket => unitsToContribution(totals.regionUnits[bucket])) }
}

export async function getState(deps: VoteServiceDeps, target: TargetKey): Promise<Record<string, TargetImpulseState>> {
  const { impulses, usesRegion } = TARGETS[target]
  const from = firstBucketInWindow(deps.now(), deps.windowMs)
  const totals = await Promise.all(impulses.map(impulse => deps.store.sumBuckets(target, impulse, from)))
  return createTargetImpulseRecord(target, (impulse) => {
    const total = totals[impulses.indexOf(impulse)] ?? { votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) }
    return toState(total, usesRegion)
  })
}

function remainingOf(target: TargetKey, all: Record<string, SessionVotes>, now: number, windowMs: number): ImpulseCounts {
  return createTargetImpulseRecord(target, impulse => remainingVotes(activeVotes((all[impulse] ?? EMPTY_SESSION).votes, now, windowMs).length))
}

export async function getRemaining(deps: VoteServiceDeps, sid: string, target: TargetKey): Promise<ImpulseCounts> {
  const all = await deps.store.getSessionVotes(sid, target)
  return remainingOf(target, all, deps.now(), deps.windowMs)
}

/** 最後の票が集計から外れた後に、セッションの記録を消してよい時刻（エポック秒） */
function sessionExpiresAt(votes: readonly CastVote[], windowMs: number): number {
  const latest = Math.max(...votes.map(vote => vote.at))
  return Math.ceil((latest + windowMs) / 1000)
}

/**
 * 投票する。impulse はその対象の衝動であること（app.ts で検証済み）。
 * region は位置情報を使わない対象では null を渡す
 */
export async function castVote(
  deps: VoteServiceDeps,
  sid: string,
  target: TargetKey,
  impulse: string,
  voteId: string,
  region: RegionBucket | null,
): Promise<CastVoteResult> {
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
    const all = await deps.store.getSessionVotes(sid, target)
    const now = deps.now()
    const current = all[impulse] ?? EMPTY_SESSION
    const active = activeVotes(current.votes, now, deps.windowMs)

    // 再送された票は記録済みとして扱い、二重に数えない
    if (active.some(vote => vote.id === voteId)) {
      return { status: 'duplicate', remaining: remainingOf(target, all, now, deps.windowMs) }
    }
    if (hasReachedLimit(active.length)) {
      return { status: 'limit', remaining: remainingOf(target, all, now, deps.windowMs) }
    }

    const votes = [...active, { id: voteId, at: now }]
    const start = bucketStart(now)
    const result = await deps.store.commitVote({
      sid,
      target,
      impulse,
      votes,
      expectedVersion: current.version,
      sessionExpiresAt: sessionExpiresAt(votes, deps.windowMs),
      bucketStart: start,
      bucketExpiresAt: bucketExpiresAt(start, deps.windowMs),
      // ウィンドウ内の何票目かで寄与度が決まる。古い票が外れれば、次の票の寄与度は戻る
      contributionUnits: contributionUnitsOf(votes.length),
      // 位置情報を使わない対象では、渡されても地域を保存しない
      region: TARGETS[target].usesRegion ? region : null,
    })
    if (result === 'committed') {
      const updated = { ...all, [impulse]: { votes, version: current.version + 1 } }
      return { status: 'accepted', remaining: remainingOf(target, updated, now, deps.windowMs) }
    }
  }
  throw new VoteConflictError()
}
