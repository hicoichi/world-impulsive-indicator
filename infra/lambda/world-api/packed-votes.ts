// セッションの投票記録を1本の文字列に詰める（docs/world-api-design.md §5）
//
// 形式：「票 ID.投票時刻（エポック秒の36進数）」をカンマでつないだもの。例：`aB3x_9Qz.t3k1q0,Zk2m-Pq1.t3k1q5`
// 票 ID は英数字・ハイフン・アンダースコアだけ（app.ts で検証済み）なので、区切りの「.」「,」と混ざらない。
// 上限いっぱい（100票）でも約 1.6KB に収まり、DynamoDB の書き込み単位を抑えられる。
//
// 時刻は秒に切り捨てる。そのため票は最大1秒早く12時間のウィンドウから外れるが、上限の判定には影響しない程度の差。

import type { CastVote } from '../../../shared/domain/vote'

const ENTRY_SEPARATOR = ','
const FIELD_SEPARATOR = '.'
const TIME_RADIX = 36
const ID_PATTERN = /^[\w-]{1,64}$/

export function packVotes(votes: readonly CastVote[]): string {
  return votes
    .map(vote => `${vote.id}${FIELD_SEPARATOR}${Math.floor(vote.at / 1000).toString(TIME_RADIX)}`)
    .join(ENTRY_SEPARATOR)
}

/** 詰めた文字列を読み戻す。壊れた部分は無視する */
export function unpackVotes(packed: string): CastVote[] {
  if (!packed) return []
  const votes: CastVote[] = []
  for (const entry of packed.split(ENTRY_SEPARATOR)) {
    const [id, time, ...rest] = entry.split(FIELD_SEPARATOR)
    if (rest.length > 0 || !id || !time || !ID_PATTERN.test(id)) continue
    const seconds = Number.parseInt(time, TIME_RADIX)
    if (!Number.isFinite(seconds) || seconds < 0) continue
    votes.push({ id, at: seconds * 1000 })
  }
  return votes
}
