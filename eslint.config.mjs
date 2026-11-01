// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // 生成物は対象外
  { ignores: ['playwright-report/**', 'test-results/**', 'infra/cdk.out/**'] },
)
