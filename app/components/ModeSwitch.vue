<script setup lang="ts">
// モードの切替（オリジナル版／函南町版）。画面上部中央の2択のボタン。
// 配置・寸法・動きは UI モック（docs/函南町_スマホ-html/App.dc.html）の値
import type { TargetKey } from '#shared/domain/target'

defineProps<{ mode: TargetKey }>()

const emit = defineEmits<{ select: [mode: TargetKey] }>()

const OPTIONS: { mode: TargetKey, label: string, latin: string }[] = [
  { mode: 'world', label: 'オリジナル', latin: 'JAPAN' },
  { mode: 'kannami', label: '函南町', latin: 'KANNAMI' },
]
</script>

<template>
  <div class="wrap">
    <div
      class="seg"
      role="group"
      aria-label="表示モード"
    >
      <span
        class="pill"
        :class="{ kannami: mode === 'kannami' }"
        aria-hidden="true"
      />
      <button
        v-for="option in OPTIONS"
        :key="option.mode"
        type="button"
        :class="{ on: mode === option.mode }"
        :aria-pressed="mode === option.mode"
        :data-mode="option.mode"
        @click="emit('select', option.mode)"
      >
        {{ option.label }} <small>{{ option.latin }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: absolute;
  left: 0;
  right: 0;
  top: 56px;
  display: flex;
  justify-content: center;
  z-index: 11;
  pointer-events: none;
}

.seg {
  position: relative;
  display: flex;
  padding: 3px;
  border-radius: 24px;
  border: 1px solid rgba(244, 241, 234, 0.22);
  background: rgba(1, 3, 10, 0.55);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

button {
  position: relative;
  z-index: 1;
  height: 38px;
  min-width: 112px;
  padding: 0 16px;
  border: none;
  border-radius: 19px;
  background: transparent;
  color: rgba(244, 241, 234, 0.72);
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.06em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: color 0.3s ease;
}

button small {
  font-family: var(--font-latin);
  font-weight: 600;
  font-size: 9.5px;
  letter-spacing: 0.16em;
  opacity: 0.7;
}

button.on {
  color: #06101e;
}

button:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.pill {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: 19px;
  background: var(--color-text);
  box-shadow: 0 0 22px rgba(244, 241, 234, 0.35);
  transition: transform 0.45s cubic-bezier(0.3, 1.3, 0.5, 1);
}

.pill.kannami {
  transform: translateX(100%);
}

@media (min-width: 900px) and (min-height: 520px) {
  .wrap {
    top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pill {
    transition: none;
  }
}
</style>
