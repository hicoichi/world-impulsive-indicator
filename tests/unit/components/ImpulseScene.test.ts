import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { IMPULSE_KEYS, IMPULSE_LABELS } from '#shared/domain/impulse'
import { KANNAMI_IMPULSE_KEYS, KANNAMI_IMPULSE_LABELS } from '#shared/domain/target'
import ImpulseScene from '../../../app/components/ImpulseScene.vue'
import type { ImpulseView } from '../../../app/composables/useWorld'
import type { EffectChoice } from '../../../app/domain/effectLottery'
import { IMPULSE_THEMES, KANNAMI_THEMES, type ImpulseTheme } from '../../../app/domain/impulseTheme'
import { IDLE_VISUAL } from '../../../app/domain/visualState'
import type { SceneEngine } from '../../../app/visuals/sceneEngine'

// happy-dom には Canvas 2D がないため、描画エンジンは偽物にする
function fakeEngine(): SceneEngine {
  return { setVisual: vi.fn(), setOrigin: vi.fn(), play: vi.fn(), setReducedMotion: vi.fn(), destroy: vi.fn() }
}

function view(partial: Partial<ImpulseView> = {}): ImpulseView {
  return { count: 12845, visual: IDLE_VISUAL, remaining: 100, limitReached: false, ...partial }
}

interface SceneProps {
  label?: string
  theme?: ImpulseTheme
  view?: ImpulseView
  vote?: () => EffectChoice | null
  engine?: SceneEngine
}

function mountScene(props: SceneProps = {}) {
  const engine = props.engine ?? fakeEngine()
  return mount(ImpulseScene, {
    props: {
      label: props.label ?? IMPULSE_LABELS.ikki,
      theme: props.theme ?? IMPULSE_THEMES.ikki,
      view: props.view ?? view(),
      vote: props.vote ?? (() => ({ kind: 'normal', index: 0 })),
      createEngine: () => engine,
    },
    slots: { icon: '<svg class="icon" />' },
  })
}

describe('ImpulseScene', () => {
  test.each(IMPULSE_KEYS)('見出し・衝動名・ボタンの文言（%s）', (impulse) => {
    const wrapper = mountScene({ label: IMPULSE_LABELS[impulse], theme: IMPULSE_THEMES[impulse] })
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
    expect(text).not.toMatch(/\d|時間|票/)
  })

  test('上限前は一文を出さない', () => {
    expect(mountScene().get('.limit').text()).toBe('')
  })

  test('地球の描画先は読み上げない', () => {
    expect(mountScene().get('canvas').attributes('aria-hidden')).toBe('true')
  })

  test.each(KANNAMI_IMPULSE_KEYS)('函南町版も同じ画面で、見出しと衝動名を出す（%s）', (impulse) => {
    const wrapper = mountScene({ label: KANNAMI_IMPULSE_LABELS[impulse], theme: KANNAMI_THEMES[impulse] })
    expect(wrapper.find('.overline').text()).toBe(KANNAMI_THEMES[impulse].overline)
    expect(wrapper.find('.name').text()).toBe(KANNAMI_IMPULSE_LABELS[impulse])
    expect(wrapper.get('button.vote').text()).toBe(KANNAMI_IMPULSE_LABELS[impulse])
  })

  test('投票を受け付けたら、抽選結果を描画エンジンに渡す。上限なら渡さない', async () => {
    const engine = fakeEngine()
    const accepted = mountScene({ engine, vote: () => ({ kind: 'normal', index: 2 }) })
    await accepted.get('button.vote').trigger('click')
    expect(engine.play).toHaveBeenCalledWith({ kind: 'normal', index: 2 })
    const spent = fakeEngine()
    const limited = mountScene({ engine: spent, vote: () => null })
    await limited.get('button.vote').trigger('click')
    expect(spent.play).not.toHaveBeenCalled()
  })

  test('描画エンジンを作れなくても、数字と投票は使える', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const vote = vi.fn(() => ({ kind: 'normal' as const, index: 0 }))
    const wrapper = mount(ImpulseScene, {
      props: {
        label: IMPULSE_LABELS.ikki,
        theme: IMPULSE_THEMES.ikki,
        view: view(),
        vote,
        createEngine: () => {
          throw new Error('Canvas 2D を使えない')
        },
      },
    })
    expect(wrapper.find('.count').text()).toBe('12,845')
    await wrapper.get('button.vote').trigger('click')
    expect(vote).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
