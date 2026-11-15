// 集計状態の取得と投票の送信の境界。World API（apiWorldSource.ts）とモック（mockWorldSource.ts）の実装がある。
// どちらを使うかは createWorldSource.ts だけで決め、画面と composable は実装の違いを知らない。
// 評価対象（オリジナル版・函南町版）ごとに1つ作る。K はその対象の衝動のキー

import type { ImpulseKey } from '#shared/domain/impulse'
import type { RegionKey } from '#shared/domain/region'
import type { TargetImpulseState } from '#shared/domain/worldState'

export type Remaining<K extends string = ImpulseKey> = Record<K, number>

export type SubmitResult<K extends string = ImpulseKey>
  = | { status: 'accepted' | 'duplicate', remaining: Remaining<K> }
    | { status: 'limit', remaining: Remaining<K> }

export interface WorldSource<K extends string = ImpulseKey> {
  /** 集計状態。通信に失敗したら例外を投げる */
  fetchState(): Promise<Record<K, TargetImpulseState>>
  /** 自分の残り投票枠。まだセッションがなければ null（上限いっぱい） */
  fetchRemaining(): Promise<Remaining<K> | null>
  /**
   * 票を送る。同じ voteId は1票としてしか数えない。通信に失敗したら例外を投げる。
   * region は現在地の地方（位置情報を使わないとき・使わない対象では null。地域なしの票になる）
   */
  submitVote(impulse: K, voteId: string, region: RegionKey | null): Promise<SubmitResult<K>>
}
