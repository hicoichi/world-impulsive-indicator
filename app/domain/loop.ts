// 横スクロールのループ（UI モックの JpSwipe と同じ方式）
//
// 並び：[最後の複製, 1, 2, …, n, 最初の複製]。スクロールスナップで1枚ずつ止め、
// 複製に止まったら同じ見た目の本物へ瞬時に移動して、端から端へつながって見せる。
// 「位置」は並びの中の番号（0 = 先頭の複製）、「番号」は衝動の番号（0 〜 n−1）。

export interface LoopPanel<T> {
  item: T
  /** 衝動の番号 */
  index: number
  /** 端の複製か */
  clone: boolean
}

export function loopPanels<T>(items: readonly T[]): LoopPanel<T>[] {
  const n = items.length
  const real = items.map((item, index) => ({ item, index, clone: false }))
  const last = real[n - 1]
  const first = real[0]
  if (!last || !first) return []
  return [{ ...last, clone: true }, ...real, { ...first, clone: true }]
}

/** 衝動の番号を、その本物のパネルの位置にする */
export function positionOf(index: number): number {
  return index + 1
}

/** 位置を衝動の番号にする（複製は対応する本物の番号） */
export function indexAt(position: number, count: number): number {
  return (((position - 1) % count) + count) % count
}

/** 複製の位置なら、同じ見た目の本物の位置を返す。本物ならそのまま */
export function settledPosition(position: number, count: number): number {
  if (position <= 0) return count
  if (position >= count + 1) return 1
  return position
}

/** 縦ホイールを切り替えとみなす最小の移動量（UI モックの値） */
export const WHEEL_MIN_DELTA = 14

/** 縦ホイールで連続して切り替えない間隔（UI モックの値） */
export const WHEEL_INTERVAL_MS = 700

/** 縦ホイールを切り替えに使うか。横の移動はスクロールそのものに任せる */
export function wheelDirection(deltaX: number, deltaY: number): -1 | 1 | 0 {
  if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) < WHEEL_MIN_DELTA) return 0
  return deltaY > 0 ? 1 : -1
}
