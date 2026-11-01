import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import RegionPill from '../../../app/components/RegionPill.vue'

describe('RegionPill', () => {
  test('使っていないときは JAPAN だけ', () => {
    const w = mount(RegionPill, { props: { region: null, status: 'off' } })
    expect(w.get('button').text()).toBe('JAPAN')
    expect(w.get('button').attributes('aria-pressed')).toBe('false')
  })

  test('使っているときは地方名を添える', () => {
    const w = mount(RegionPill, { props: { region: 'kanto', status: 'on' } })
    expect(w.get('button').text()).toBe('JAPAN · KANTO')
    expect(w.get('button').attributes('aria-pressed')).toBe('true')
  })

  test('押すと toggle を通知する', async () => {
    const w = mount(RegionPill, { props: { region: null, status: 'off' } })
    await w.get('button').trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
  })

  test('正確な位置を送らないことを説明する', () => {
    const w = mount(RegionPill, { props: { region: null, status: 'off' } })
    expect(w.get('#region-note').text()).toContain('正確な位置は送りません')
    expect(w.get('button').attributes('aria-describedby')).toBe('region-note')
  })
})
