import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Tauri 需要固定端口，且不要把日志清屏
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // 编辑器/工具写入时的临时文件不要被监听，否则 Windows 上会 EBUSY 崩溃
      ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/*.tmpdir/**', '**/node_modules/**', '**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'chrome110',
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // 主窗口 + 桌面浮窗两个入口
      input: {
        main: 'index.html',
        mini: 'mini.html',
      },
    },
  },
})
