import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => ({
  server: {watch: {ignored: ['**/android/**', '**/dist-native/**']}},
  base: mode === 'pages' ? process.env.PAGES_BASE || '/qressi/' : './',
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'native',
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable.png'],
      manifest: {
        name: 'QRessi',
        short_name: 'QRessi',
        description: 'Сканер и мастерская QR-кодов. Всё под рукой, даже без интернета.',
        lang: 'ru',
        theme_color: '#202020',
        background_color: '#202020',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
          {src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
          {src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,txt,md}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: {outDir: mode === 'native' ? 'dist-native' : 'dist', target: 'es2020'},
}));
