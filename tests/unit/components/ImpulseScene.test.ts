import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { IMPULSE_KEYS, IMPULSE_LABELS } from '#shared/domain/impulse'
import ImpulseScene from '../../../app/components/ImpulseScene.vue'
import type { ImpulseView } from '../../../app/composables/useWorld'
import { IMPULSE_THEMES } from '../../../app/domain/impulseTheme'
import { IDLE_VISUAL } from '../../../app/domain/visualState'

// happy-dom には Canvas 2D がないため、描画エンジンは作らない
vi.mock('../../../app/visuals/stage', () => ({
  createEngine: () => ({ setVisual: vi.fn(), setOrigin: vi.fn(), play: vi.fn(), setReducedMotion: vi.fn(), destroy: vi.fn() }),
}))

function view(partial: Partial<ImpulseView> = {}): ImpulseView {
  return { count: 12845, visual: IDLE_VISUAL, remaining: 10, limitReached: false, ...partial }
}

function mountScene(props: { impulse?: (typeof IMPULSE_KEYS)[number], view?: ImpulseView, vote?: () => null | { kind: 'rare' } | { kind: 'normal', index: number } } = {}) {
  return mount(ImpulseScene, { props: { impulse: props.impulse ?? 'ikki', view: props.view ?? view(), vote: props.vote ?? (() => ({ kind: 'normal', index: 0 })) } })
}

describe('ImpulseScene', () => {
  test.each(IMPULSE_KEYS)('見出し・衝動名・ボタンの文言（%s）', (impulse) => {
    const wrapper = mountScene({ impulse })
    expect(wrapper.find('.overline').text()).toBe(IMPULSE_THEMES[impulse].overline)
    expect(wrapper.find('.name').text()).toBe(IMPULSE_LABELS[impulse])
    // ボタンの文言は衝動名（docs/frontend-plan.md Q-16）
    const button = wrapper.get('button.vote')
    expect(button.text()).toBe(IMPULSE_LABELS[impulse])
    expect(button.attributes('aria-label')).toBe(`${IMPULSE_LABELS[impulse]} に投票する`)
  })

  test('集計数は桁区切りで表示し、未取得なら —', () => {
    expect(mountScene().find('.count').text()).toBe('12,845')
    expect(mountScene({ view: view({ count: null }) }).find('.count').text()).toBe('—')
  })

  test('ボタンを押すと投票し、集計数がポップする', async () => {
    const vote = vi.fn(() => ({ kind: 'normal' as const, index: 1 }))
    const wrapper = mountScene({ vote })
    await wrapper.get('button.vote').trigger('click')
    expect(vote).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.count').classes()).toContain('popA')
    expect(wrapper.get('.scene').classes()).not.toContain('shakeA')
  })

  test('レアの演出では画面が揺れ、フラッシュする', async () => {
    const wrapper = mountScene({ vote: () => ({ kind: 'rare' }) })
    await wrapper.get('button.vote').trigger('click')
    expect(wrapper.get('.scene').classes()).toContain('shakeA')
    expect(wrapper.get('.flash').classes()).toContain('flashA')
  })

  test('上限に達したらボタンを弱め、一文を出す。仕組みは書かない（Q-10）', () => {
    const wrapper = mountScene({ view: view({ remaining: 0, limitReached: true }) })
    const button = wrapper.get('button.vote')
    expect(button.classes()).toContain('spent')
    expect(button.attributes('aria-disabled')).toBe('true')
    const text = wrapper.get('.limit').text()
    expect(text).toBe('しばらくしてから、また')
    expect(text).not.toMatch(/12|時間|10|票/)
  })

  test('上限前は一文を出さない', () => {
    expect(mountScene().get('.limit').text()).toBe('')
  })

  test('地球の描画先は読み上げない', () => {
    expect(mountScene().get('canvas').attributes('aria-hidden')).toBe('true')
  })
})
