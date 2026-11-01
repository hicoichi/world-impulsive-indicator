<script setup lang="ts">
// 1つの衝動の画面：地球と演出（canvas）、見出し・衝動名・集計数、投票ボタン。
// 配置・寸法・投票時の手応え（ポップ・フラッシュ・揺れ・振動）は UI モック（JpScene）の値
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { IMPULSE_LABELS, type ImpulseKey } from '#shared/domain/impulse'
import type { ImpulseView } from '../composables/useWorld'
import { useReducedMotion } from '../composables/useReducedMotion'
import type { EffectChoice } from '../domain/effectLottery'
import { IMPULSE_THEMES } from '../domain/impulseTheme'
import { createEngine, type Engine } from '../visuals/stage'
import ImpulseIcon from './ImpulseIcon.vue'

const props = defineProps<{
  impulse: ImpulseKey
  view: ImpulseView
  /** ループの端の複製。初回の演出をせず、操作も受けない */
  clone?: boolean
  /** 投票する。受け付けたら演出の抽選結果、上限なら null */
  vote: () => EffectChoice | null
}>()

const label = computed(() => IMPULSE_LABELS[props.impulse])
const theme = computed(() => IMPULSE_THEMES[props.impulse])
const countText = computed(() => (props.view.count === null ? '—' : props.view.count.toLocaleString('ja-JP')))

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const reducedMotion = useReducedMotion()
let engine: Engine | null = null

// 同じアニメーションを続けて起こせるよう、A と B を交互に付け替える（UI モックと同じ方式）
const pop = ref<0 | 1 | 2>(0)
const flash = ref<0 | 1 | 2>(0)
const shake = ref<0 | 1 | 2>(0)
const next = (v: 0 | 1 | 2): 1 | 2 => (v === 1 ? 2 : 1)

const style = computed(() => ({
  '--accent': theme.value.accent,
  '--glow': theme.value.glow,
  '--button-bg': theme.value.button.background,
  '--button-fg': theme.value.button.foreground,
  '--halo': theme.value.button.halo,
  '--button-shadow': theme.value.button.shadow,
}))

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  }
  catch {
    // 振動できない端末では何もしない
  }
}

function onVote(): void {
  const choice = props.vote()
  if (!choice) return
  pop.value = next(pop.value)
  const rare = choice.kind === 'rare'
  if (rare) {
    flash.value = next(flash.value)
    shake.value = next(shake.value)
  }
  engine?.play(choice)
  vibrate(rare ? [20, 40, 80] : 12)
}

onMounted(() => {
  if (!canvas.value || !root.value || !stage.value) return
  try {
    engine = createEngine({
      canvas: canvas.value,
      root: root.value,
      stage: stage.value,
      impulse: props.impulse,
      intro: !props.clone,
      reducedMotion: reducedMotion.value,
    })
    engine.setVisual(props.view.visual)
  }
  catch (error) {
    // 描画できなくても、数字と投票は使えるようにする
    console.warn('地球を描画できない', error)
  }
})

watch(() => props.view.visual, visual => engine?.setVisual(visual))
watch(reducedMotion, value => engine?.setReducedMotion(value))
onBeforeUnmount(() => engine?.destroy())
</script>

<template>
  <section
    ref="root"
    class="scene"
    :class="{ shakeA: shake === 1, shakeB: shake === 2 }"
    :style="style"
    :aria-label="label"
  >
    <!-- 地球と演出の描画先。装飾なので読み上げない -->
    <canvas
      ref="canvas"
      class="canvas"
      aria-hidden="true"
    />
    <div
      class="flash"
      :class="{ flashA: flash === 1, flashB: flash === 2 }"
      :style="{ background: theme.flash }"
    />
    <div
      ref="stage"
      class="stage"
    />
    <div class="info">
      <div class="overline">
        {{ theme.overline }}
      </div>
      <h2 class="name">
        {{ label }}
      </h2>
      <div
        class="count"
        :class="{ popA: pop === 1, popB: pop === 2 }"
      >
        {{ countText }}
      </div>
    </div>
    <div class="cta">
      <button
        type="button"
        class="vote"
        :class="{ spent: view.limitReached }"
        :aria-label="`${label} に投票する`"
        :aria-disabled="view.limitReached || undefined"
        @click="onVote"
      >
        <ImpulseIcon :impulse="impulse" />
        <span>{{ label }}</span>
      </button>
    </div>
    <!-- 上限の一文。仕組み（12時間・10票）は書かない（docs/frontend-plan.md Q-10） -->
    <p
      class="limit"
      aria-live="polite"
    >
      <template v-if="view.limitReached">
        しばらくしてから、また
      </template>
    </p>
  </section>
</template>

<style scoped>
.scene {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.flash {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
}

.flashA {
  animation: flashA 1.1s ease-out;
}

.flashB {
  animation: flashB 1.1s ease-out;
}

@keyframes flashA {
  0% {
    opacity: 0.9;
  }

  100% {
    opacity: 0;
  }
}

@keyframes flashB {
  0% {
    opacity: 0.9;
  }

  100% {
    opacity: 0;
  }
}

.shakeA {
  animation: shakeA 0.6s ease-out;
}

.shakeB {
  animation: shakeB 0.6s ease-out;
}

@keyframes shakeA {
  0%,
  100% {
    transform: translate(0, 0);
  }

  15% {
    transform: translate(-7px, 4px);
  }

  30% {
    transform: translate(6px, -5px);
  }

  45% {
    transform: translate(-4px, 3px);
  }

  60% {
    transform: translate(3px, -2px);
  }

  80% {
    transform: translate(-1px, 1px);
  }
}

@keyframes shakeB {
  0%,
  100% {
    transform: translate(0, 0);
  }

  15% {
    transform: translate(7px, -4px);
  }

  30% {
    transform: translate(-6px, 5px);
  }

  45% {
    transform: translate(4px, -3px);
  }

  60% {
    transform: translate(-3px, 2px);
  }

  80% {
    transform: translate(1px, -1px);
  }
}

/* 地球を描く範囲。描画エンジンはこの要素の位置と大きさを基準にする */
.stage {
  position: absolute;
  left: 0;
  right: 0;
  top: 56px;
  bottom: 236px;
  pointer-events: none;
}

.info {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 136px;
  text-align: center;
  pointer-events: none;
  z-index: 4;
}

.overline {
  font-family: var(--font-latin);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.28em;
  margin-bottom: 4px;
  color: var(--accent);
}

.name {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 28px;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--accent);
}

.count {
  display: inline-block;
  font-family: var(--font-latin);
  font-weight: 700;
  font-size: 56px;
  line-height: 1;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
  color: #fff;
  text-shadow: 0 0 34px var(--glow);
  transform-origin: 50% 60%;
}

.popA {
  animation: popA 0.55s cubic-bezier(0.2, 1.7, 0.4, 1);
}

.popB {
  animation: popB 0.55s cubic-bezier(0.2, 1.7, 0.4, 1);
}

@keyframes popA {
  0% {
    transform: scale(1);
  }

  30% {
    transform: scale(1.14);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes popB {
  0% {
    transform: scale(1);
  }

  30% {
    transform: scale(1.14);
  }

  100% {
    transform: scale(1);
  }
}

.cta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 52px;
  display: flex;
  justify-content: center;
  z-index: 4;
}

.vote {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 268px;
  height: 72px;
  padding: 0 36px;
  box-sizing: border-box;
  border: none;
  border-radius: 36px;
  background: var(--button-bg);
  color: var(--button-fg);
  box-shadow: var(--button-shadow);
  font-family: var(--font-body);
  font-weight: 900;
  font-size: 21px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform 0.12s ease, filter 0.2s ease, opacity 0.3s ease;
  touch-action: manipulation;
}

.vote:hover {
  filter: brightness(1.08);
}

.vote:active {
  transform: scale(0.93);
}

.vote:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 5px;
}

/* 呼吸する光の輪 */
.vote::before {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 44px;
  border: 2px solid var(--halo);
  animation: breathe 2.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.5;
  }

  50% {
    transform: scale(1.06);
    opacity: 0.12;
  }
}

/* 上限に達したら弱める */
.vote.spent {
  opacity: 0.45;
  filter: saturate(0.5);
  cursor: default;
}

.vote.spent:active {
  transform: none;
}

.vote.spent::before {
  animation: none;
  opacity: 0;
}

.limit {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 36px;
  margin: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.12em;
  color: rgba(244, 241, 234, 0.75);
  z-index: 4;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .vote::before {
    animation: none;
  }
}

/* PC：情報は左、地球は右（UI モックの「幅 900 以上かつ高さ 520 以上」） */
@media (min-width: 900px) and (min-height: 520px) {
  .stage {
    left: 30%;
    right: 2%;
    top: 64px;
    bottom: 112px;
  }

  .info {
    left: 6.5%;
    right: auto;
    bottom: auto;
    top: 38%;
    text-align: left;
  }

  .overline {
    font-size: 12px;
    margin-bottom: 10px;
  }

  .name {
    font-size: 46px;
  }

  .count {
    font-size: 104px;
    margin-top: 8px;
    transform-origin: 0 60%;
  }

  .cta {
    bottom: 44px;
  }

  .vote {
    min-width: 320px;
    height: 78px;
    font-size: 23px;
    border-radius: 39px;
  }

  /* PC はボタンの上に出す（下はページドットと重なるため） */
  .limit {
    bottom: 136px;
  }
}
</style>
