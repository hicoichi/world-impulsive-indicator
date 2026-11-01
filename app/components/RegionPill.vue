<script setup lang="ts">
// ヘッダーの地域のピル。押すと現在地の地方を使うかどうかを切り替える（USM Activity 6）。
// 見た目は UI モックの「JAPAN」のピル。使っている間は地方名を添え、ピンを塗りつぶす
import { computed } from 'vue'
import type { RegionKey } from '#shared/domain/region'
import type { RegionStatus } from '../composables/useRegion'

const props = defineProps<{
  region: RegionKey | null
  status: RegionStatus
}>()

const emit = defineEmits<{ toggle: [] }>()

const on = computed(() => props.status === 'on' && props.region !== null)
const text = computed(() => (on.value && props.region ? `JAPAN · ${props.region.toUpperCase()}` : 'JAPAN'))
</script>

<template>
  <button
    type="button"
    class="region"
    :class="{ on, locating: status === 'locating' }"
    :aria-pressed="on"
    :aria-busy="status === 'locating' || undefined"
    aria-label="現在地の地方を反映する"
    aria-describedby="region-note"
    @click="emit('toggle')"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      :fill="on ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle
        cx="12"
        cy="10"
        r="2.3"
        :fill="on ? 'var(--color-space)' : 'none'"
      />
    </svg>
    <span aria-live="polite">{{ text }}</span>
  </button>
  <!-- 読み上げ用の説明。正確な位置は送らない（USM Activity 6） -->
  <p
    id="region-note"
    class="note"
  >
    現在地を8つの地方に丸めて、投票と演出に使います。正確な位置は送りません。
  </p>
</template>

<style scoped>
.region {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px 0 8px;
  border-radius: 14px;
  border: 1px solid rgba(244, 241, 234, 0.28);
  background: rgba(1, 3, 10, 0.45);
  font-family: var(--font-latin);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--color-text);
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.region:hover {
  background: rgba(244, 241, 234, 0.1);
}

.region:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

.region.on {
  border-color: rgba(244, 241, 234, 0.6);
}

.region.locating svg {
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .region.locating svg {
    animation: none;
  }
}

.note {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
