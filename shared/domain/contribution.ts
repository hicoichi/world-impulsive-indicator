// 集計上の寄与度（USM Activity 5、docs/world-api-design.md §4・Q-07a）
//
// 投票回数（上限10票）とは別に、1人の連打が全体を過度に左右しないよう、
// ウィンドウ内の n 票目の寄与度を √n − √(n−1) にする。n 票の合計は √n になる（10票で約3.16）。

/**
 * 寄与度を整数で保存・加算するための倍率。DynamoDB の ADD で誤差をためないため、1/1000 単位で持つ
 */
export const CONTRIBUTION_SCALE = 1000

/** ウィンドウ内の n 票目（1 始まり）の寄与度 */
export function contributionOf(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`票の順番は1以上の整数（指定値：${n}）`)
  return Math.sqrt(n) - Math.sqrt(n - 1)
}

/** n 票目の寄与度を保存用の整数にする */
export function contributionUnitsOf(n: number): number {
  return Math.round(contributionOf(n) * CONTRIBUTION_SCALE)
}

/** 保存用の整数を寄与度に戻す */
export function unitsToContribution(units: number): number {
  return units / CONTRIBUTION_SCALE
}
