// 現在地の地方（USM Activity 6）。位置情報は任意で、ヘッダーの地域のピルを押したときだけ求める。
//
// - 保存するのは8地方のコードだけ（緯度経度は保存も送信もしない）。ブラウザの中にだけ持つ
// - 許可されなかった・取得できなかった・日本の外なら、地方なし（全国の演出、地域なしの票）のまま
// - もう一度押すと使うのをやめる

import { readonly, ref, type InjectionKey } from 'vue'
import { isRegionKey, type RegionKey } from '#shared/domain/region'
import { regionAt } from '../domain/locateRegion'

export const REGION_STORAGE_KEY = 'world-impulsive-indicator:region'

/** 正確さは要らない（地方に丸める）。電池と時間を使わないよう、粗い位置・古い位置でよい */
const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 15_000 }

export type RegionStatus = 'off' | 'locating' | 'on' | 'unavailable'

export interface RegionStorage {
  get(): string | null
  set(value: string): void
  clear(): void
}

function browserStorage(): RegionStorage {
  return {
    get() {
      try {
        return globalThis.localStorage?.getItem(REGION_STORAGE_KEY) ?? null
      }
      catch {
        return null
      }
    },
    set(value) {
      try {
        globalThis.localStorage?.setItem(REGION_STORAGE_KEY, value)
      }
      catch {
        // 保存できなくても、開いている間は使える
      }
    },
    clear() {
      try {
        globalThis.localStorage?.removeItem(REGION_STORAGE_KEY)
      }
      catch {
        // 消せなくても害はない
      }
    },
  }
}

export interface RegionOptions {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'> | null
  storage?: RegionStorage
}

export function useRegion(options: RegionOptions = {}) {
  const storage = options.storage ?? browserStorage()
  const region = ref<RegionKey | null>(null)
  const status = ref<RegionStatus>('off')

  /** 前に選んだ地方を読み直す（ブラウザでだけ呼ぶ） */
  function restore(): void {
    const saved = storage.get()
    if (isRegionKey(saved)) {
      region.value = saved
      status.value = 'on'
    }
  }

  function turnOff(next: RegionStatus = 'off'): void {
    region.value = null
    status.value = next
    storage.clear()
  }

  function locate(): Promise<void> {
    const geolocation = options.geolocation === undefined ? globalThis.navigator?.geolocation : options.geolocation
    if (!geolocation) {
      turnOff('unavailable')
      return Promise.resolve()
    }
    status.value = 'locating'
    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (position) => {
          const found = regionAt(position.coords.latitude, position.coords.longitude)
          if (found) {
            region.value = found
            status.value = 'on'
            storage.set(found)
          }
          else {
            turnOff('unavailable')
          }
          resolve()
        },
        () => {
          turnOff('unavailable')
          resolve()
        },
        GEOLOCATION_OPTIONS,
      )
    })
  }

  /** ピルを押したとき：使っていれば止め、使っていなければ現在地を求める */
  function toggle(): Promise<void> {
    if (status.value === 'locating') return Promise.resolve()
    if (status.value === 'on') {
      turnOff()
      return Promise.resolve()
    }
    return locate()
  }

  return { region: readonly(region), status: readonly(status), restore, toggle }
}

export type Region = ReturnType<typeof useRegion>

export const REGION_KEY: InjectionKey<Region> = Symbol('region')
