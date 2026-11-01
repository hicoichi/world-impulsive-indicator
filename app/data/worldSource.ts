// 集計状態の取得と投票の送信の境界。World API（apiWorldSource.ts）とモック（mockWorldSource.ts）の実装がある。
// どちらを使うかは createWorldSource.ts だけで決め、画面と composable は実装の違いを知らない

import type { ImpulseKey } from '#shared/domain/impulse'
import type { RegionKey } from '#shared/domain/region'
import type { WorldState } from '#shared/domain/worldState'

export type Remaining = Record<ImpulseKey, number>

export type SubmitResult
  = | { status: 'accepted' | 'duplicate', remaining: Remaining }
    | { status: 'limit', remaining: Remaining }

export interface WorldSource {
  /** 集計状態。通信に失敗したら例外を投げる */
  fetchState(): Promise<WorldState>
  /** 自分の残り投票枠。まだセッションがなければ null（上限いっぱい） */
  fetchRemaining(): Promise<Remaining | null>
  /**
   * 票を送る。同じ voteId は1票としてしか数えない。通信に失敗したら例外を投げる。
   * region は現在地の地方（位置情報を使わないときは null。地域なしの票になる）
   */
  submitVote(impulse: ImpulseKey, voteId: string, region: RegionKey | null): Promise<SubmitResult>
}
