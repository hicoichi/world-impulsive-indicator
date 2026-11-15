// 評価対象（target）と、対象ごとの衝動の定義。画面と Lambda の両方が使う
// （docs/user-story-map-extended.md Step 1、docs/world-api-design.md §8）
//
// 集計・上限は「評価対象 × 衝動」ごとに独立する。同じ衝動のキー（ikki）でも、対象が違えば別の集計になる。
// Step 1 では対象をここに固定で持つ。ToBe で任意の対象に広げるときは、定義を DB に移す。

import { IMPULSE_KEYS } from './impulse'

export const TARGET_KEYS = ['world', 'kannami'] as const

export type TargetKey = (typeof TARGET_KEYS)[number]

/** 対象を省略したときの既定。オリジナル版（世界） */
export const DEFAULT_TARGET: TargetKey = 'world'

/** 函南町版の衝動の種類と順序（2026-11-15 決定：一揆したい → 荷物をまとめたい → 骨を埋めたい） */
export const KANNAMI_IMPULSE_KEYS = ['ikki', 'pack', 'settle'] as const

export type KannamiImpulseKey = (typeof KANNAMI_IMPULSE_KEYS)[number]

export const KANNAMI_IMPULSE_LABELS: Record<KannamiImpulseKey, string> = {
  ikki: '一揆したい',
  pack: '荷物をまとめたい',
  settle: '骨を埋めたい',
}

interface TargetDefinition {
  /** 衝動のキー（この順序で並べる） */
  impulses: readonly string[]
  /** 投票者の位置情報（8地方）を集計に使うか。函南町版は使わない */
  usesRegion: boolean
}

export const TARGETS: Record<TargetKey, TargetDefinition> = {
  world: { impulses: IMPULSE_KEYS, usesRegion: true },
  kannami: { impulses: KANNAMI_IMPULSE_KEYS, usesRegion: false },
}

export function isTargetKey(value: unknown): value is TargetKey {
  return typeof value === 'string' && (TARGET_KEYS as readonly string[]).includes(value)
}

/** その対象に存在する衝動のキーか */
export function isImpulseOf(target: TargetKey, value: unknown): value is string {
  return typeof value === 'string' && TARGETS[target].impulses.includes(value)
}

/** 対象の各衝動に同じ初期値を持つ記録を作る（衝動の順序を保つ） */
export function createTargetImpulseRecord<T>(target: TargetKey, initial: (impulse: string) => T): Record<string, T> {
  return Object.fromEntries(TARGETS[target].impulses.map(impulse => [impulse, initial(impulse)]))
}
