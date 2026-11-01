import { describe, expect, test } from 'vitest'
import { useRegion, type RegionStorage } from '../../../app/composables/useRegion'

function memory(initial: string | null = null): RegionStorage & { value: string | null } {
  return {
    value: initial,
    get() {
      return this.value
    },
    set(v) {
      this.value = v
    },
    clear() {
      this.value = null
    },
  }
}

function geolocationAt(lat: number, lon: number) {
  const calls: PositionOptions[] = []
  return {
    calls,
    getCurrentPosition(success: PositionCallback, _error?: PositionErrorCallback | null, options?: PositionOptions) {
      calls.push(options ?? {})
      success({ coords: { latitude: lat, longitude: lon } } as GeolocationPosition)
    },
  }
}

const denied = {
  getCurrentPosition(_s: PositionCallback, error?: PositionErrorCallback | null) {
    error?.({ code: 1, message: 'denied' } as GeolocationPositionError)
  },
}

describe('useRegion', () => {
  test('最初は使わない（位置情報を勝手に求めない）', () => {
    const geo = geolocationAt(35.69, 139.7)
    const r = useRegion({ geolocation: geo, storage: memory() })
    r.restore()
    expect(r.status.value).toBe('off')
    expect(r.region.value).toBeNull()
    expect(geo.calls).toHaveLength(0)
  })

  test('押すと現在地を地方に丸めて使い、地方のコードだけを保存する', async () => {
    const storage = memory()
    const geo = geolocationAt(34.7, 135.5)
    const r = useRegion({ geolocation: geo, storage })
    await r.toggle()
    expect(r.status.value).toBe('on')
    expect(r.region.value).toBe('kinki')
    expect(storage.value).toBe('kinki')
    // 正確さを求めない
    expect(geo.calls[0]?.enableHighAccuracy).toBe(false)
  })

  test('もう一度押すと使うのをやめ、保存も消す', async () => {
    const storage = memory()
    const r = useRegion({ geolocation: geolocationAt(35.69, 139.7), storage })
    await r.toggle()
    await r.toggle()
    expect(r.status.value).toBe('off')
    expect(r.region.value).toBeNull()
    expect(storage.value).toBeNull()
  })

  test('許可されなければ地方なしのまま', async () => {
    const r = useRegion({ geolocation: denied, storage: memory() })
    await r.toggle()
    expect(r.status.value).toBe('unavailable')
    expect(r.region.value).toBeNull()
  })

  test('日本の外なら地方なしのまま', async () => {
    const r = useRegion({ geolocation: geolocationAt(40.71, -74.0), storage: memory() })
    await r.toggle()
    expect(r.region.value).toBeNull()
  })

  test('位置情報を使えないブラウザでも動く', async () => {
    const r = useRegion({ geolocation: null, storage: memory() })
    await r.toggle()
    expect(r.status.value).toBe('unavailable')
  })

  test('前に選んだ地方を読み直す。不正な値は無視する', () => {
    const r = useRegion({ geolocation: null, storage: memory('kyushu') })
    r.restore()
    expect(r.region.value).toBe('kyushu')
    const bad = useRegion({ geolocation: null, storage: memory('35.6,139.7') })
    bad.restore()
    expect(bad.region.value).toBeNull()
  })
})
