import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
    open: false,
    // shared/can-signals.json 位于仓库根目录，是前后端唯一的信号定义载体
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:8002' }
  }
})
