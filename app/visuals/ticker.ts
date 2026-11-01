// 全画面で1つの requestAnimationFrame を共有する。画面ごとにループを持たないため

type FrameFn = (now: number) => void

const subscribers = new Set<FrameFn>()
let handle = 0

function tick(now: number): void {
  handle = requestAnimationFrame(tick)
  for (const fn of subscribers) {
    try {
      fn(now)
    }
    catch (error) {
      // 1つの画面の失敗で、他の画面の描画を止めない
      console.error('描画に失敗した', error)
    }
  }
}

export function subscribeFrame(fn: FrameFn): () => void {
  subscribers.add(fn)
  if (!handle) handle = requestAnimationFrame(tick)
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0 && handle) {
      cancelAnimationFrame(handle)
      handle = 0
    }
  }
}
