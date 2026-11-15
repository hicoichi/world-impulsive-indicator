// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // 生成物と、docs/ に置いた UI モック（書き出された HTML と同梱のライブラリ）は対象外
  { ignores: ['playwright-report/**', 'test-results/**', 'infra/cdk.out/**', 'docs/**/*-html/**'] },
)
