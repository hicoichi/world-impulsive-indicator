<script setup lang="ts">
// メイン画面1枚。オリジナル版（世界）と函南町版を、ページ遷移せずに切り替える（拡張 USM S1-01）。
// 配置と切替の演出は UI モック（docs/函南町_スマホ-html/App.dc.html）の値。
//
// - 開いたときは毎回オリジナル版から始める（docs/frontend-plan.md §5 K-6）
// - 表示中のモードだけを描き、集計を取りに行く。もう一方の画面は作らない
// - 集計・上限はモードごとに独立（World API の target。docs/world-api-design.md §8）
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { IMPULSE_KEYS, IMPULSE_LABELS, type ImpulseKey } from '#shared/domain/impulse'
import { DEFAULT_TARGET, KANNAMI_IMPULSE_KEYS, KANNAMI_IMPULSE_LABELS, type KannamiImpulseKey, type TargetKey } from '#shared/domain/target'
import ImpulseIcon from './components/ImpulseIcon.vue'
import ImpulseScene from './components/ImpulseScene.vue'
import LoopTrack from './components/LoopTrack.vue'
import ModeSwitch from './components/ModeSwitch.vue'
import RegionPill from './components/RegionPill.vue'
import SettingsMenu from './components/SettingsMenu.vue'
import { useRareSetting } from './composables/useRareSetting'
import { useRegion } from './composables/useRegion'
import { useWorld } from './composables/useWorld'
import { createKannamiSource, createWorldSource } from './data/createWorldSource'
import { IMPULSE_THEMES, KANNAMI_THEMES } from './domain/impulseTheme'
import { createKannamiEngine } from './visuals/kannami/engine'
import type { SceneEngineFactory } from './visuals/sceneEngine'
import { createEngine } from './visuals/stage'

const config = useRuntimeConfig()
const apiBaseUrl = String(config.public.apiBaseUrl ?? '')
const region = useRegion()
const rare = useRareSetting()
const world = useWorld({
  source: createWorldSource(apiBaseUrl),
  region: () => region.region.value,
  allowRare: () => rare.enabled.value,
})
// 函南町版は位置情報を使わず、レア演出もない（OFF 固定。docs/frontend-plan.md §5 K-2）
const kannami = useWorld({
  source: createKannamiSource(apiBaseUrl),
  keys: KANNAMI_IMPULSE_KEYS,
  allowRare: () => false,
})

const mode = ref<TargetKey>(DEFAULT_TARGET)
/** 切替の光。同じアニメーションを続けて起こせるよう A と B を交互にする */
const warp = ref<0 | 1 | 2>(0)
/** 一度でも切り替えたか（最初の表示では入場の演出をしない） */
const switched = ref(false)

function setMode(next: TargetKey): void {
  if (next === mode.value) return
  mode.value = next
  warp.value = warp.value === 1 ? 2 : 1
  switched.value = true
}

function sourceOf(target: TargetKey) {
  return target === 'kannami' ? kannami : world
}

// 表示中のモードだけ集計を取りに行く
watch(mode, (next, prev) => {
  sourceOf(prev).stop()
  sourceOf(next).start()
})

// 保存した地方・設定の読み直しと取得は、ブラウザでだけ行う（静的生成のときは通信しない）
onMounted(() => {
  region.restore()
  rare.restore()
  world.start()
})
onBeforeUnmount(() => {
  world.stop()
  kannami.stop()
})

const worldEngine = (impulse: ImpulseKey): SceneEngineFactory => options => createEngine({ ...options, impulse })
const kannamiEngine = (impulse: KannamiImpulseKey): SceneEngineFactory => options => createKannamiEngine({ ...options, impulse })

const warpBackground = computed(() => (mode.value === 'kannami'
  ? 'radial-gradient(circle at 55% 50%, rgba(170,255,200,0.35), rgba(120,170,255,0.12) 40%, rgba(0,0,0,0) 70%)'
  : 'radial-gradient(circle at 55% 50%, rgba(180,210,255,0.4), rgba(80,120,255,0.12) 40%, rgba(0,0,0,0) 70%)'))
</script>

<template>
  <main class="app">
    <div
      v-if="mode === 'world'"
      class="layer"
      :class="{ enter: switched }"
      data-mode="world"
    >
      <LoopTrack
        :items="IMPULSE_KEYS"
        :labels="IMPULSE_LABELS"
      >
        <template #panel="{ item, clone }">
          <ImpulseScene
            :label="IMPULSE_LABELS[item]"
            :theme="IMPULSE_THEMES[item]"
            :view="world.views[item].value"
            :clone="clone"
            :origin-region="region.region.value"
            :vote="() => world.vote(item)"
            :create-engine="worldEngine(item)"
          >
            <template #icon>
              <ImpulseIcon :impulse="item" />
            </template>
          </ImpulseScene>
        </template>
      </LoopTrack>
    </div>
    <div
      v-else
      class="layer"
      :class="{ enter: switched }"
      data-mode="kannami"
    >
      <LoopTrack
        :items="KANNAMI_IMPULSE_KEYS"
        :labels="KANNAMI_IMPULSE_LABELS"
      >
        <template #panel="{ item, clone }">
          <ImpulseScene
            :label="KANNAMI_IMPULSE_LABELS[item]"
            :theme="KANNAMI_THEMES[item]"
            :view="kannami.views[item].value"
            :clone="clone"
            :vote="() => kannami.vote(item)"
            :create-engine="kannamiEngine(item)"
          >
            <template #icon>
              <ImpulseIcon :impulse="item" />
            </template>
          </ImpulseScene>
        </template>
      </LoopTrack>
    </div>

    <div
      class="warp"
      :class="{ warpA: warp === 1, warpB: warp === 2 }"
      :style="{ background: warpBackground }"
      aria-hidden="true"
    />

    <header class="head">
      <div class="right">
        <RegionPill
          v-if="mode === 'world'"
          :region="region.region.value"
          :status="region.status.value"
          @toggle="region.toggle()"
        />
        <!-- 函南町版は位置情報を使わないので、押せない表示だけ -->
        <span
          v-else
          class="place"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
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
            />
          </svg>
          <span>KANNAMI</span>
        </span>
        <SettingsMenu
          :rare-enabled="rare.enabled.value"
          @toggle-rare="rare.toggle()"
        />
      </div>
    </header>

    <ModeSwitch
      :mode="mode"
      @select="setMode"
    />
  </main>
</template>

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-space);
}

.layer {
  position: absolute;
  inset: 0;
}

/* 切り替えて入ってきたモード：少し大きくぼけた状態から戻る */
.layer.enter {
  animation: enter 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes enter {
  0% {
    opacity: 0;
    transform: scale(1.06);
    filter: blur(8px);
  }

  100% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}

.warp {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
  opacity: 0;
}

.warpA {
  animation: warpA 0.8s ease-out;
}

.warpB {
  animation: warpB 0.8s ease-out;
}

@keyframes warpA {
  0% {
    opacity: 0.85;
  }

  100% {
    opacity: 0;
  }
}

@keyframes warpB {
  0% {
    opacity: 0.85;
  }

  100% {
    opacity: 0;
  }
}

.head {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 12px 0 16px;
  box-sizing: border-box;
  z-index: 12;
  pointer-events: none;
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.place {
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
  white-space: nowrap;
}

@media (min-width: 900px) and (min-height: 520px) {
  .head {
    height: 64px;
    padding: 0 20px 0 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .layer.enter,
  .warpA,
  .warpB {
    animation: none;
  }
}
</style>
