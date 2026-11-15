// レア演出の ON/OFF の設定（拡張 USM S1-05、docs/frontend-plan.md §5 K-5）。
//
// - 初期値は ON。端末の localStorage に保存する（個人の好みなので、サーバーには送らない）
// - 効くのはオリジナル版だけ。函南町版はレア演出がない（OFF 固定。K-2）
// - 集計・寄与度には影響しない（抽選でレアを選ばなくなるだけ）

import { readonly, ref } from 'vue'

export const RARE_SETTING_STORAGE_KEY = 'world-impulsive-indicator:rare-effects'

/** 保存する値。ON は保存しない（初期値に戻すだけ） */
const OFF_VALUE = 'off'

export interface RareSettingStorage {
  get(): string | null
  set(value: string): void
  clear(): void
}

function browserStorage(): RareSettingStorage {
  return {
    get() {
      try {
        return globalThis.localStorage?.getItem(RARE_SETTING_STORAGE_KEY) ?? null
      }
      catch {
        return null
      }
    },
    set(value) {
      try {
        globalThis.localStorage?.setItem(RARE_SETTING_STORAGE_KEY, value)
      }
      catch {
        // 保存できなくても、開いている間は設定が効く
      }
    },
    clear() {
      try {
        globalThis.localStorage?.removeItem(RARE_SETTING_STORAGE_KEY)
      }
      catch {
        // 消せなくても、開いている間は設定が効く
      }
    },
  }
}

export function useRareSetting(storage: RareSettingStorage = browserStorage()) {
  const enabled = ref(true)

  /** 保存した設定を読み直す。読めなければ ON のまま（静的生成のときは呼ばない） */
  function restore(): void {
    enabled.value = storage.get() !== OFF_VALUE
  }

  function set(value: boolean): void {
    enabled.value = value
    if (value) storage.clear()
    else storage.set(OFF_VALUE)
  }

  function toggle(): void {
    set(!enabled.value)
  }

  return { enabled: readonly(enabled), restore, set, toggle }
}

export type RareSetting = ReturnType<typeof useRareSetting>
