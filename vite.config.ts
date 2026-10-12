/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 版本号只认 package.json 这一处。
 *
 * 界面上要显示它，如果在这里手写一遍，迟早会和实际发出去的版本对不上。
 * （另两处需要一起改的是 `tauri.conf.json` 和 `src-tauri/Cargo.toml`，
 * 它们给的是打包和二进制自己的版本号，构建时没有共享来源。）
 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  // Tauri 需要固定端口，端口被占用时直接失败而不是自动切换
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
})
