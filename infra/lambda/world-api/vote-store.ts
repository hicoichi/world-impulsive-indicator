// 票の保存先の境界。本番は DynamoDB（dynamo-vote-store.ts）、テストはメモリ上の実装を使う

import type { ImpulseKey } from '../../../shared/domain/impulse'
import type { RegionBucket } from '../../../shared/domain/region'
import type { CastVote } from '../../../shared/domain/vote'

/** あるセッションの、ある衝動への投票記録。地域は持たない（個人と地域を結び付けないため） */
export interface SessionVotes {
  votes: CastVote[]
  /** 楽観的ロック用の版。記録がなければ 0 */
  version: number
}

export interface CommitVoteInput {
  sid: string
  impulse: ImpulseKey
  /** 更新後の投票記録（ウィンドウ外の票は除いたもの） */
  votes: CastVote[]
  /** 読み取ったときの版。保存時に一致しなければ競合 */
  expectedVersion: number
  /** セッションの記録を TTL で消してよい時刻（エポック秒） */
  sessionExpiresAt: number
  /** 加算する集計の枠の開始時刻 */
  bucketStart: number
  /** 集計の枠を TTL で消してよい時刻（エポック秒） */
  bucketExpiresAt: number
  /** この票の寄与度（CONTRIBUTION_SCALE 倍の整数） */
  contributionUnits: number
  /** 寄与度を加算する地域 */
  region: RegionBucket
}

export type CommitVoteResult = 'committed' | 'conflict'

/** ある衝動の、指定した枠以降の合計 */
export interface BucketTotals {
  votes: number
  /** 寄与度の合計（CONTRIBUTION_SCALE 倍の整数） */
  contributionUnits: number
  /** 地域ごとの寄与度の合計（CONTRIBUTION_SCALE 倍の整数） */
  regionUnits: Record<RegionBucket, number>
}

export interface VoteStore {
  /** セッションの全衝動の投票記録 */
  getSessionVotes(sid: string): Promise<Record<ImpulseKey, SessionVotes>>
  /** セッションの記録の更新と、集計の加算を1つのトランザクションで行う */
  commitVote(input: CommitVoteInput): Promise<CommitVoteResult>
  /** 指定した枠以降の票数・寄与度の合計 */
  sumBuckets(impulse: ImpulseKey, fromBucket: number): Promise<BucketTotals>
}
