// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // 生成物と UI モックは対象外
  { ignores: ['mock/**', 'playwright-report/**', 'test-results/**', 'infra/cdk.out/**'] },
)
