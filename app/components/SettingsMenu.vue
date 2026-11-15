<script setup lang="ts">
// 設定（歯車）のメニュー。中身はレア演出の ON/OFF だけ（拡張 USM S1-05）。
// 配置・寸法は UI モック（docs/函南町_スマホ-html/App.dc.html）の値。
// 説明文はどのモードにも当てはまるようにする（docs/frontend-plan.md §5 K-3）
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ rareEnabled: boolean }>()

const emit = defineEmits<{ toggleRare: [] }>()

const open = ref(false)
const gear = ref<HTMLButtonElement | null>(null)
const rareSwitch = ref<HTMLButtonElement | null>(null)

async function setOpen(value: boolean): Promise<void> {
  open.value = value
  await nextTick()
  // 開いたらスイッチへ、閉じたら歯車へフォーカスを移す
  if (value) rareSwitch.value?.focus()
  else gear.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (open.value && event.key === 'Escape') void setOpen(false)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const note = () => (props.rareEnabled ? 'ON — ときどき特別な演出が起きます' : 'OFF — 通常演出のみ')
</script>

<template>
  <button
    ref="gear"
    type="button"
    class="gear"
    aria-label="設定"
    :aria-expanded="open"
    aria-controls="settings-menu"
    @click="setOpen(!open)"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle
        cx="16"
        cy="7"
        r="2"
      />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle
        cx="10"
        cy="17"
        r="2"
      />
    </svg>
  </button>
  <template v-if="open">
    <button
      type="button"
      class="scrim"
      aria-label="設定を閉じる"
      @click="setOpen(false)"
    />
    <div
      id="settings-menu"
      class="menu"
      role="dialog"
      aria-label="設定"
    >
      <div class="menu-head">
        SETTINGS
      </div>
      <div class="row">
        <div>
          <span
            id="rare-label"
            class="row-label"
          >レア演出</span>
          <p
            id="rare-note"
            aria-live="polite"
          >
            {{ note() }}
          </p>
        </div>
        <button
          ref="rareSwitch"
          type="button"
          class="switch"
          :class="{ on: rareEnabled }"
          role="switch"
          :aria-checked="rareEnabled"
          aria-labelledby="rare-label"
          aria-describedby="rare-note"
          @click="emit('toggleRare')"
        >
          <span />
        </button>
      </div>
    </div>
  </template>
</template>

<style scoped>
.gear {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: 1px solid rgba(244, 241, 234, 0.22);
  background: rgba(1, 3, 10, 0.45);
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  pointer-events: auto;
  transition: background 0.2s ease;
}

.gear:hover {
  background: rgba(244, 241, 234, 0.12);
}

.gear:focus-visible,
.switch:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 13;
  border: none;
  background: transparent;
  padding: 0;
  cursor: default;
  pointer-events: auto;
}

.menu {
  position: absolute;
  top: 60px;
  right: 12px;
  z-index: 14;
  width: 244px;
  box-sizing: border-box;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(244, 241, 234, 0.18);
  background: rgba(6, 10, 22, 0.92);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  animation: menu-in 0.22s ease-out;
}

@keyframes menu-in {
  0% {
    opacity: 0;
    transform: translateY(-6px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-head {
  font-family: var(--font-latin);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.22em;
  color: rgba(244, 241, 234, 0.6);
  margin-bottom: 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
}

.row-label {
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text);
}

.row p {
  margin: 2px 0 0;
  font-size: 11px;
  color: rgba(244, 241, 234, 0.66);
}

.switch {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 30px;
  border-radius: 15px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: rgba(244, 241, 234, 0.22);
  transition: background 0.25s ease;
}

.switch.on {
  background: #7fd4a6;
}

.switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 0.25s ease;
}

.switch.on span {
  transform: translateX(22px);
}

@media (min-width: 900px) and (min-height: 520px) {
  .menu {
    top: 66px;
    right: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu {
    animation: none;
  }

  .switch,
  .switch span {
    transition: none;
  }
}
</style>
