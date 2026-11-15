<script setup lang="ts" generic="K extends string">
// 横スクロールで衝動を切り替える枠。PC の矢印、ページドットを持つ。各パネルの中身はスロットで受け取る
// （オリジナル版と函南町版で同じ枠を使う。docs/frontend-plan.md §5 K5）。
// 配置と寸法は UI モック（JpSwipe・KnSwipe）の値
import { computed, ref } from 'vue'
import { useLoopTrack } from '../composables/useLoopTrack'
import { loopPanels } from '../domain/loop'

const props = defineProps<{
  /** 衝動のキー（この順序で並べる） */
  items: readonly K[]
  /** ドットの読み上げに使う衝動名 */
  labels: Record<K, string>
}>()

defineSlots<{
  panel(props: { item: K, clone: boolean }): unknown
}>()

const track = ref<HTMLElement | null>(null)
const panels = computed(() => loopPanels(props.items))
const { current, go, goTo, onScroll, onWheel, onKeydown } = useLoopTrack(track, { count: props.items.length })
</script>

<template>
  <div
    class="root"
    tabindex="0"
    aria-roledescription="カルーセル"
    aria-label="衝動"
    @keydown="onKeydown"
  >
    <div
      ref="track"
      class="track"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
      <!-- 表示していない衝動と端の複製は、読み上げ・Tab の対象にしない -->
      <div
        v-for="(panel, position) in panels"
        :key="position"
        class="panel"
        :data-impulse="panel.item"
        :data-clone="panel.clone || undefined"
        :aria-hidden="panel.clone || panel.index !== current"
        :inert="panel.clone || panel.index !== current"
      >
        <slot
          name="panel"
          :item="panel.item"
          :clone="panel.clone"
        />
      </div>
    </div>

    <button
      type="button"
      class="arrow prev"
      aria-label="前の衝動へ"
      @click="go(-1)"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      ><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <button
      type="button"
      class="arrow next"
      aria-label="次の衝動へ"
      @click="go(1)"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      ><path d="M9 5l7 7-7 7" /></svg>
    </button>

    <nav
      class="dots"
      aria-label="衝動の切り替え"
    >
      <button
        v-for="(key, index) in items"
        :key="key"
        type="button"
        class="dot"
        :class="{ on: index === current }"
        :aria-label="`${labels[key]} へ移動`"
        :aria-current="index === current ? 'true' : undefined"
        @click="goTo(index)"
      >
        <span />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--color-space);
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.track {
  position: absolute;
  inset: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  scroll-behavior: auto;
}

.track::-webkit-scrollbar {
  display: none;
}

.panel {
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  scroll-snap-align: center;
  scroll-snap-stop: always;
  overflow: hidden;
}

.dots {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  z-index: 8;
}

.dot {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.dot span {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: rgba(244, 241, 234, 0.32);
  transition: width 0.3s ease, background 0.3s ease;
}

.dot.on span {
  width: 20px;
  background: rgba(244, 241, 234, 0.9);
}

.dot:focus-visible,
.arrow:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

.arrow {
  position: absolute;
  top: 50%;
  width: 48px;
  height: 48px;
  margin-top: -24px;
  border-radius: 24px;
  border: 1px solid rgba(244, 241, 234, 0.2);
  background: rgba(1, 3, 10, 0.35);
  color: var(--color-text);
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 8;
  transition: background 0.2s ease;
}

.arrow:hover {
  background: rgba(244, 241, 234, 0.12);
}

.prev {
  left: 22px;
}

.next {
  right: 22px;
}

/* PC（UI モックの「幅 900 以上かつ高さ 520 以上」） */
@media (min-width: 900px) and (min-height: 520px) {
  .arrow {
    display: flex;
  }
}
</style>
