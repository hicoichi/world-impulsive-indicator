import { describe, expect, test } from 'vitest'
import { useRareSetting, type RareSettingStorage } from '../../../app/composables/useRareSetting'

function memory(initial: string | null = null): RareSettingStorage & { value: string | null } {
  return {
    value: initial,
    get() {
      return this.value
    },
    set(value) {
      this.value = value
    },
    clear() {
      this.value = null
    },
  }
}

describe('レア演出の設定（docs/frontend-plan.md §5 K-5）', () => {
  test('初期値は ON', () => {
    const setting = useRareSetting(memory())
    setting.restore()
    expect(setting.enabled.value).toBe(true)
  })

  test('OFF にすると保存し、読み直しても OFF', () => {
    const storage = memory()
    useRareSetting(storage).set(false)
    expect(storage.value).toBe('off')
    const again = useRareSetting(storage)
    again.restore()
    expect(again.enabled.value).toBe(false)
  })

  test('ON に戻すと保存を消す', () => {
    const storage = memory('off')
    const setting = useRareSetting(storage)
    setting.restore()
    setting.toggle()
    expect(setting.enabled.value).toBe(true)
    expect(storage.value).toBeNull()
  })

  test('知らない値が保存されていたら ON', () => {
    const setting = useRareSetting(memory('broken'))
    setting.restore()
    expect(setting.enabled.value).toBe(true)
  })
})
