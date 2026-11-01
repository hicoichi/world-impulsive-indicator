<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue'
import LoopTrack from './components/LoopTrack.vue'
import { REGION_KEY, useRegion } from './composables/useRegion'
import { useWorld, WORLD_KEY } from './composables/useWorld'
import { createWorldSource } from './data/createWorldSource'

const config = useRuntimeConfig()
const region = useRegion()
const world = useWorld({
  source: createWorldSource(String(config.public.apiBaseUrl ?? '')),
  region: () => region.region.value,
})
provide(WORLD_KEY, world)
provide(REGION_KEY, region)

// 取得と保存した地方の読み直しはブラウザでだけ行う（静的生成のときは通信しない）
onMounted(() => {
  region.restore()
  world.start()
})
onBeforeUnmount(() => world.stop())
</script>

<template>
  <LoopTrack />
</template>
