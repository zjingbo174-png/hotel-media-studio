import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 相对 base：GitHub Pages 项目页（/repo-name/）与自定义域名都能直接工作。
export default defineConfig({
  base: './',
  server: {
    // 编辑器/工具的原子写入会生成 .*.tmpdir 临时目录，Windows 上可能被锁住导致 watcher 崩溃
    watch: { ignored: ['**/.*.tmpdir/**', '**/.*.tmp', '**/.data/**'] },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: '酒店自媒体创作工作台',
        short_name: '酒店创作台',
        description: '每日计划打卡、酒店类爆款选题灵感、热点二创方案，手机端优先。',
        lang: 'zh-CN',
        theme_color: '#e0573b',
        background_color: '#f7f3ec',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // 只对站点根（/ 或 /repo/）做导航回退；深链交给服务端 404 页跳回根，
        // 否则深链被 SW 回退成 index.html 后，相对资源路径会解析错。
        navigateFallbackAllowlist: [/^\/[^/]*\/?$/],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
