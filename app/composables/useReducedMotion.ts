// 「視差効果を減らす」設定（prefers-reduced-motion）を追いかける

import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useReducedMotion() {
  const reduced = ref(false)
  let query: MediaQueryList | undefined
  const update = () => {
    reduced.value = query?.matches ?? false
  }
  onMounted(() => {
    query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    update()
    query?.addEventListener('change', update)
  })
  onBeforeUnmount(() => query?.removeEventListener('change', update))
  return reduced
}
