import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the build works on GitHub Pages (/repo/) and any static host.
export default defineConfig({
  base: './',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'INF.02 — przygotowanie do egzaminu',
        short_name: 'INF.02',
        description: 'Nauka do egzaminu zawodowego INF.02 / Подготовка к экзамену INF.02',
        theme_color: '#2f6df6',
        background_color: '#f4f6fb',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,md}'],
        // /vm/ is a separate page (real Linux via CheerpX) with its own
        // cross-origin-isolation service worker: never precache it and never
        // answer its navigations with the SPA shell.
        globIgnores: ['vm/**'],
        navigateFallbackDenylist: [/\/vm(\/|$)/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/img/'),
            handler: 'CacheFirst',
            options: { cacheName: 'figures', expiration: { maxEntries: 1000 } },
          },
        ],
      },
    }),
  ],
})
