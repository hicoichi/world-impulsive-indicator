// 投票ごとの演出の抽選（USM Activity 4）。確率と回避の仕組みは UI モックのもの

/** 衝動ごとの通常の演出の数 */
export const NORMAL_EFFECT_COUNT = 4

/** レアの演出の確率 */
export const RARE_RATE = 0.07

export type EffectChoice = { kind: 'normal', index: number } | { kind: 'rare' }

/**
 * 抽選器。直前と同じ通常の演出は選ばない。
 * 乱数は注入する（テストで差し替えるため）
 */
export function createEffectLottery(random: () => number = Math.random) {
  let last = -1
  return {
    draw(): EffectChoice {
      if (random() < RARE_RATE) return { kind: 'rare' }
      let index = Math.floor(random() * NORMAL_EFFECT_COUNT)
      if (index === last) index = (index + 1 + Math.floor(random() * (NORMAL_EFFECT_COUNT - 1))) % NORMAL_EFFECT_COUNT
      last = index
      return { kind: 'normal', index }
    },
  }
}
