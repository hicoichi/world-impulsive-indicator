// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },
  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      title: '世界の空気を、衝動で測る。',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#01030a' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          // 書体は UI モックと同じ（docs/frontend-plan.md §1）
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap',
        },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      // World API（infra/ の CloudFront）の URL。ビルド時の環境変数 NUXT_PUBLIC_API_BASE_URL で指定する
      apiBaseUrl: '',
    },
  },
  compatibilityDate: '2026-11-01',
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
