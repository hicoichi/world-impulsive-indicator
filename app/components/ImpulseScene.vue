<script setup lang="ts">
// 1つの衝動の画面：地球（F2 で描画）、見出し・衝動名・集計数、投票ボタン。
// 配置と寸法は UI モック（JpScene）の値
import { computed } from 'vue'
import { IMPULSE_LABELS, type ImpulseKey } from '#shared/domain/impulse'
import { IMPULSE_THEMES } from '../domain/impulseTheme'
import ImpulseIcon from './ImpulseIcon.vue'

const props = defineProps<{
  impulse: ImpulseKey
  /** 有効投票数。まだ取得できていなければ null */
  count: number | null
}>()

const emit = defineEmits<{ vote: [] }>()

const label = computed(() => IMPULSE_LABELS[props.impulse])
const theme = computed(() => IMPULSE_THEMES[props.impulse])
const countText = computed(() => (props.count === null ? '—' : props.count.toLocaleString('ja-JP')))

const style = computed(() => ({
  '--accent': theme.value.accent,
  '--glow': theme.value.glow,
  '--button-bg': theme.value.button.background,
  '--button-fg': theme.value.button.foreground,
  '--halo': theme.value.button.halo,
  '--button-shadow': theme.value.button.shadow,
}))
</script>

<template>
  <section
    class="scene"
    :style="style"
    :aria-label="label"
  >
    <!-- 地球と演出の描画先（F2）。装飾なので読み上げない -->
    <canvas
      class="canvas"
      aria-hidden="true"
    />
    <div class="stage" />
    <div class="info">
      <div class="overline">
        {{ theme.overline }}
      </div>
      <h2 class="name">
        {{ label }}
      </h2>
      <div class="count">
        {{ countText }}
      </div>
    </div>
    <div class="cta">
      <button
        type="button"
        class="vote"
        :aria-label="`${label} に投票する`"
        @click="emit('vote')"
      >
        <ImpulseIcon :impulse="impulse" />
        <span>{{ label }}</span>
      </button>
    </div>
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
  transition: transform 0.12s ease, filter 0.2s ease;
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
}
</style>
