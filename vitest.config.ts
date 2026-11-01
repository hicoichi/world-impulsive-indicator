import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// ドメイン層・データ層・composable・コンポーネントの単体テスト。
// Nuxt に依存しないコードだけを対象にし、Nuxt の起動なしで動かす。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Nuxt の別名と同じ。画面側のコードは shared/ を #shared で import する
    alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom',
  },
})
