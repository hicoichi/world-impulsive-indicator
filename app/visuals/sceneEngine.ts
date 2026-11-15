// 1画面の描画エンジンの共通の形。オリジナル版の地球（stage.ts）と函南町版（kannami/engine.ts）が実装する。
// 画面（ImpulseScene.vue）はどちらのエンジンかを知らない

import type { RegionKey } from '#shared/domain/region'
import type { EffectChoice } from '../domain/effectLottery'
import type { ImpulseVisual } from '../domain/visualState'

export interface SceneEngineOptions {
  canvas: HTMLCanvasElement
  /** 画面全体の要素（大きさの基準） */
  root: HTMLElement
  /** 主役（地球・函南町）を描く範囲の要素 */
  stage: HTMLElement
  /** 初回の演出をするか（端の複製ではしない） */
  intro: boolean
  reducedMotion: boolean
}

export interface SceneEngine {
  /** 集計状態から決まる持続的な演出の強さ */
  setVisual(visual: ImpulseVisual): void
  /** 演出の起点を現在地の地方にする（位置情報を使う画面だけ） */
  setOrigin?(region: RegionKey | null): void
  /** 投票ごとの一時的な演出 */
  play(choice: EffectChoice): void
  setReducedMotion(value: boolean): void
  destroy(): void
}

export type SceneEngineFactory = (options: SceneEngineOptions) => SceneEngine
