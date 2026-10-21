import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { dashboardApi } from './server/api.js'

export default defineConfig({
  // Fixa a raiz no addon: o CLI roda de dentro do workspace do ai-job-search.
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), dashboardApi()],
  server: {
    // Só na máquina local: a API grava arquivos do workspace e executa scripts.
    host: '127.0.0.1',
    port: Number(process.env.AJS_DASHBOARD_PORT) || 5174,
    strictPort: true,
    open: !process.env.DASHBOARD_NO_OPEN,
  },
})
