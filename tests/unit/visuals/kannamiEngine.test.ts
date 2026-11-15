import { afterEach, describe, expect, test, vi } from 'vitest'
import { KANNAMI_IMPULSE_KEYS } from '#shared/domain/target'
import { IDLE_VISUAL } from '../../../app/domain/visualState'
import { createKannamiEngine } from '../../../app/visuals/kannami/engine'
import { heightAt, kannamiScene } from '../../../app/visuals/kannami/geometry'

// happy-dom には Canvas 2D がないため、呼び出しを数えるだけの偽物を使う。
// 描画の中身は確かめず、例外なく描き続けられること・止められることだけを確かめる
function fakeContext() {
  const calls = { fill: 0, stroke: 0, drawImage: 0 }
  const gradient = { addColorStop: () => {} }
  const target: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fill: () => {
      calls.fill++
    },
    stroke: () => {
      calls.stroke++
    },
    drawImage: () => {
      calls.drawImage++
    },
  }
  const ctx = new Proxy(target, {
    get(t, key) {
      if (typeof key === 'string' && key in t) return t[key]
      return () => {}
    },
    set(t, key, value) {
      if (typeof key === 'string') t[key] = value
      return true
    },
  })
  return { ctx, calls }
}

function setup(impulse: (typeof KANNAMI_IMPULSE_KEYS)[number]) {
  const { ctx, calls } = fakeContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D)
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.push(fn)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const root = document.createElement('div')
  const stage = document.createElement('div')
  const canvas = document.createElement('canvas')
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, toJSON: () => ({}) }
  root.getBoundingClientRect = () => rect
  stage.getBoundingClientRect = () => ({ ...rect, top: 56, height: 552, bottom: 608 })
  const engine = createKannamiEngine({ canvas, root, stage, impulse, intro: true, reducedMotion: false })
  /** 描画ループを n フレーム進める */
  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      const fn = frames.shift()
      fn?.(performance.now() + i * 16)
    }
  }
  return { engine, calls, run }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('函南町の舞台', () => {
  test('地形・名所・森・遠景が作られ、作り直さない', () => {
    const scene = kannamiScene()
    expect(scene.faces.length).toBeGreaterThan(1000)
    expect(scene.lines.length).toBeGreaterThan(500)
    expect(scene.trees.length).toBeGreaterThan(100)
    expect(scene.fuji.length).toBeGreaterThan(1000)
    expect(kannamiScene()).toBe(scene)
  })

  test('低性能の端末向けに、遠景の粒子を減らせる', () => {
    expect(kannamiScene({ particles: 0.5 }).fuji.length).toBeLessThan(kannamiScene().fuji.length)
  })

  test('台座の上の高さは、名所のあたりで UI モックの値になる', () => {
    // 十国峠は約 770 m（0.7）、役場のある低地は約 20 m（0.03）
    expect(heightAt(0.68, 0.34)).toBeCloseTo(0.7, 1)
    expect(heightAt(-0.58, -0.56)).toBeCloseTo(0.03, 1)
  })
})

describe('函南町版の描画エンジン', () => {
  test.each(KANNAMI_IMPULSE_KEYS)('例外なく描き続け、投票の演出を重ねられる（%s）', (impulse) => {
    const { engine, calls, run } = setup(impulse)
    engine.setVisual({ ...IDLE_VISUAL, activity: 0.8 })
    run(30)
    for (let i = 0; i < 40; i++) engine.play({ kind: 'normal', index: 0 })
    run(120)
    expect(calls.fill).toBeGreaterThan(0)
    expect(calls.drawImage).toBeGreaterThan(0)
    engine.destroy()
  })

  test('動きを減らす設定でも描ける', () => {
    const { engine, run, calls } = setup('pack')
    engine.setReducedMotion(true)
    run(10)
    engine.play({ kind: 'normal', index: 0 })
    run(10)
    expect(calls.stroke).toBeGreaterThan(0)
    engine.destroy()
  })

  test('破棄したら描かない', () => {
    const { engine, run, calls } = setup('ikki')
    engine.destroy()
    run(5)
    expect(calls.fill).toBe(0)
  })
})
