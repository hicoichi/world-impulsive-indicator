// 画面の大きさに応じた、演出の配置の計算

/** PC の配置にする大きさ。CSS のメディアクエリ（min-width: 900px and min-height: 520px）と同じ */
export function isWideLayout(width: number, height: number): boolean {
  return width >= 900 && height >= 520
}

/** スマホで、演出を収める左右の余白 */
export const SCREEN_MARGIN = 16

/** スマホで、演出を収める上端（ヘッダーの下） */
export const HEADER_BOTTOM = 64

export interface FlagLayout {
  /** 竿の根元 */
  bx: number
  by: number
  /** 竿の高さ（伸びきったとき） */
  poleH: number
  /** 旗の幅（高さは幅 × 0.62） */
  fw: number
}

/** 旗の高さと幅の比（UI モック） */
export const FLAG_ASPECT = 0.62

/**
 * 一揆のレアの演出の巨大な旗の配置。旗は竿の上端から右へ広がる。
 * PC は UI モックの値のまま。スマホは画面からはみ出さないよう、竿の位置と高さ・旗の幅を抑える
 */
export function giantFlagLayout(width: number, height: number, origin: { x: number, y: number } | null): FlagLayout {
  const ox = origin?.x ?? width * 0.4
  const oy = origin?.y ?? height * 0.6
  if (isWideLayout(width, height)) {
    return {
      bx: Math.min(Math.max(ox, width * 0.22), width * 0.55),
      by: oy,
      poleH: Math.min(height * 0.62, width * 1.1),
      fw: Math.min(width * 0.62, height * 0.5),
    }
  }
  const fw = Math.min(width * 0.62, height * 0.5, width - SCREEN_MARGIN * 2)
  const by = Math.min(Math.max(oy, HEADER_BOTTOM + fw * FLAG_ASPECT), height)
  return {
    // 旗の右端が画面内に収まる範囲で、起点の近くに竿を立てる
    bx: Math.min(Math.max(ox, SCREEN_MARGIN), width - SCREEN_MARGIN - fw),
    by,
    // 旗の上端がヘッダーより下に来る高さまでに抑える
    poleH: Math.max(0, Math.min(height * 0.62, width * 1.1, by - HEADER_BOTTOM)),
    fw,
  }
}
