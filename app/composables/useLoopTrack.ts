// 横スクロールのループの状態と操作。スクロールそのものはブラウザのスクロールスナップに任せる

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { indexAt, positionOf, settledPosition, WHEEL_INTERVAL_MS, wheelDirection } from '../domain/loop'

/** スクロールが止まったとみなすまでの時間（UI モックの値） */
const SETTLE_DELAY_MS = 160

export interface LoopTrackOptions {
  /** 衝動の数 */
  count: number
  /** 最初に表示する衝動の番号 */
  start?: number
  /** 時計。テストで差し替える */
  now?: () => number
}

export function useLoopTrack(track: Ref<HTMLElement | null>, options: LoopTrackOptions) {
  const { count } = options
  const now = options.now ?? Date.now
  const current = ref(options.start ?? 0)

  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let lastWheelAt = Number.NEGATIVE_INFINITY
  let resizeObserver: ResizeObserver | undefined

  function width(element: HTMLElement): number {
    return element.clientWidth || 1
  }

  function positionNow(element: HTMLElement): number {
    return Math.round(element.scrollLeft / width(element))
  }

  /** アニメーションなしで、指定した位置へ移動する */
  function jumpTo(element: HTMLElement, position: number): void {
    element.scrollLeft = position * width(element)
  }

  function scrollToPosition(element: HTMLElement, position: number): void {
    element.scrollTo({ left: position * width(element), behavior: 'smooth' })
  }

  /** 複製に止まっていたら本物へ移す */
  function settle(): void {
    const element = track.value
    if (!element) return
    const position = positionNow(element)
    const settled = settledPosition(position, count)
    if (settled !== position) jumpTo(element, settled)
  }

  /** 隣の衝動へ。端では複製を経由してループする */
  function go(direction: -1 | 1): void {
    const element = track.value
    if (!element) return
    const position = settledPosition(positionNow(element), count)
    jumpTo(element, position)
    scrollToPosition(element, position + direction)
  }

  function goTo(index: number): void {
    const element = track.value
    if (!element) return
    scrollToPosition(element, positionOf(index))
  }

  function onScroll(): void {
    const element = track.value
    if (!element) return
    const index = indexAt(positionNow(element), count)
    if (index !== current.value) current.value = index
    clearTimeout(settleTimer)
    settleTimer = setTimeout(settle, SETTLE_DELAY_MS)
  }

  /** PC の縦ホイールでも切り替える（UI モックどおり） */
  function onWheel(event: WheelEvent): void {
    const direction = wheelDirection(event.deltaX, event.deltaY)
    if (direction === 0) return
    const at = now()
    if (at - lastWheelAt < WHEEL_INTERVAL_MS) return
    lastWheelAt = at
    go(direction)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(1)
    }
    else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(-1)
    }
  }

  onMounted(() => {
    const element = track.value
    if (!element) return
    jumpTo(element, positionOf(current.value))
    // 画面の幅が変わっても、表示中の衝動の位置に合わせ直す
    resizeObserver = new ResizeObserver(() => {
      if (track.value) jumpTo(track.value, positionOf(current.value))
    })
    resizeObserver.observe(element)
  })

  onBeforeUnmount(() => {
    clearTimeout(settleTimer)
    resizeObserver?.disconnect()
  })

  return { current, go, goTo, onScroll, onWheel, onKeydown }
}
