// 演出の中の「◯秒後に実行」の予約。描画の負荷にならないため、同時に動かす演出の上限（stage.ts の MAX_EFFECTS）には数えない。
// 上限に数えると、予約の多いレアの演出（祭りの「祭」の花火など）で、先に入れた予約が間引かれてしまう

/** 予約の数の上限。連打しても際限なく増えないようにする（祭りのレア1回で約35件） */
export const MAX_TIMERS = 400

interface Timer {
  at: number
  fn: () => void
}

/**
 * 上限を超えた演出を古いものから間引く。レアの演出の主役（keep）は、他を間引いても足りないときだけ間引く。
 * レアの直後に連打しても、表示中の巨大な旗などが消えないようにするため
 */
export function trimEffects<T extends { keep?: boolean }>(effects: T[], max: number): void {
  let excess = effects.length - max
  for (let i = 0; i < effects.length && excess > 0;) {
    if (effects[i]?.keep) {
      i++
      continue
    }
    effects.splice(i, 1)
    excess--
  }
  if (excess > 0) effects.splice(0, excess)
}

export function createScheduler() {
  const timers: Timer[] = []
  return {
    /** now から delay 秒後に fn を実行する */
    schedule(now: number, delay: number, fn: () => void): void {
      timers.push({ at: now + delay, fn })
      if (timers.length > MAX_TIMERS) timers.splice(0, timers.length - MAX_TIMERS)
    },
    /** 時刻 now までに来た予約を、予約した順に実行する */
    run(now: number): void {
      const due = timers.filter(t => t.at <= now)
      if (due.length === 0) return
      for (const t of due) timers.splice(timers.indexOf(t), 1)
      for (const t of due) t.fn()
    },
    get size(): number {
      return timers.length
    },
  }
}
