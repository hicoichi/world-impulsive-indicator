<script setup lang="ts">
// 投票ボタンのアイコン。SVG は UI モックのもの
import type { ImpulseKey } from '#shared/domain/impulse'

defineProps<{ impulse: ImpulseKey }>()
</script>

<template>
  <svg
    v-if="impulse === 'ikki'"
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 21V3.5" />
    <path d="M5 4h12.5l-2.6 4.2 2.6 4.3H5" />
  </svg>
  <svg
    v-else-if="impulse === 'exodus'"
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 20.5h18" />
    <path d="M3.6 14.6l15.2-4.4c1.3-.4 1.9-1.8 1.1-2.6-.5-.5-1.3-.6-2-.4l-4.2 1.2-6-4.2-2 .6 3.6 4.9-3.8 1.1-2.2-1.6-1.5.4z" />
  </svg>
  <svg
    v-else
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 1.5v2" />
    <path d="M9 3.5h6" />
    <ellipse
      cx="12"
      cy="12"
      rx="6.2"
      ry="7.2"
    />
    <path d="M6.3 9.3h11.4M6.3 14.7h11.4" />
    <path d="M9 20.5h6" />
    <path d="M12 20.5v2" />
  </svg>
</template>
