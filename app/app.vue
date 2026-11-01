<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue'
import LoopTrack from './components/LoopTrack.vue'
import { useWorld, WORLD_KEY } from './composables/useWorld'
import { createWorldSource } from './data/createWorldSource'

const config = useRuntimeConfig()
const world = useWorld({ source: createWorldSource(String(config.public.apiBaseUrl ?? '')) })
provide(WORLD_KEY, world)

// 取得はブラウザでだけ行う（静的生成のときは通信しない）
onMounted(() => world.start())
onBeforeUnmount(() => world.stop())
</script>

<template>
  <LoopTrack />
</template>
