// 投票の上限とローリングウィンドウの判定（USM Activity 5「集計方針」）
// 姉妹リポジトリ impulsive-momentum-indicator（ad63920）の app/domain/vote.ts と同じ仕様

/** 1ユーザー × 1衝動あたり、ウィンドウ内に投じられる票数の上限 */
export const VOTE_LIMIT = 100

/** 集計ウィンドウ */
export const VOTE_WINDOW_MS = 12 * 60 * 60 * 1000

export interface CastVote {
  id: string
  /** 投票時刻（エポックミリ秒） */
  at: number
}

/**
 * ウィンドウ内に残っている票だけを返す。
 * 投票からちょうど windowMs 経過した票は対象外にする。
 */
export function activeVotes(votes: readonly CastVote[], now: number, windowMs: number): CastVote[] {
  return votes.filter(vote => now - vote.at < windowMs)
}

/** 残り投票枠 */
export function remainingVotes(activeCount: number, limit: number = VOTE_LIMIT): number {
  return Math.max(0, limit - activeCount)
}

export function hasReachedLimit(activeCount: number, limit: number = VOTE_LIMIT): boolean {
  return activeCount >= limit
}
