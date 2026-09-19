import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
    open: false,
    // 允许前端直接引用前后端共用的唯一定义目录 ../shared
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:8002' }
  }
})
