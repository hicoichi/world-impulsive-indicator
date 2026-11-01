import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import ImpulseScene from '../../../app/components/ImpulseScene.vue'
import { IMPULSE_THEMES } from '../../../app/domain/impulseTheme'
import { IMPULSE_KEYS, IMPULSE_LABELS } from '#shared/domain/impulse'

describe('ImpulseScene', () => {
  test.each(IMPULSE_KEYS)('見出し・衝動名・ボタンの文言（%s）', (impulse) => {
    const wrapper = mount(ImpulseScene, { props: { impulse, count: 12845 } })
    expect(wrapper.find('.overline').text()).toBe(IMPULSE_THEMES[impulse].overline)
    expect(wrapper.find('.name').text()).toBe(IMPULSE_LABELS[impulse])
    // ボタンの文言は衝動名（docs/frontend-plan.md Q-16）
    const button = wrapper.get('button.vote')
    expect(button.text()).toBe(IMPULSE_LABELS[impulse])
    expect(button.attributes('aria-label')).toBe(`${IMPULSE_LABELS[impulse]} に投票する`)
  })

  test('集計数は桁区切りで表示し、未取得なら —', () => {
    expect(mount(ImpulseScene, { props: { impulse: 'ikki', count: 12845 } }).find('.count').text()).toBe('12,845')
    expect(mount(ImpulseScene, { props: { impulse: 'ikki', count: null } }).find('.count').text()).toBe('—')
  })

  test('ボタンを押すと vote を通知する', async () => {
    const wrapper = mount(ImpulseScene, { props: { impulse: 'festival', count: 0 } })
    await wrapper.get('button.vote').trigger('click')
    expect(wrapper.emitted('vote')).toHaveLength(1)
  })

  test('地球の描画先は読み上げない', () => {
    expect(mount(ImpulseScene, { props: { impulse: 'exodus', count: 0 } }).get('canvas').attributes('aria-hidden')).toBe('true')
  })
})
