import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        'src/main/db/migrations/', // 迁移脚本不测试
        'src/main/index.ts', // 入口文件
        'out/',
        'dist/',
      ],
      thresholds: {
        lines: 70,     // 实测基线 70.24%，渐进收紧
        functions: 50, // 实测基线 50.69%，渐进收紧
        branches: 60,  // 实测基线 61.64%，渐进收紧
        statements: 67, // 实测基线 67.11%，渐进收紧
        // 目标: lines 80 / functions 80 / branches 75 / statements 80
      },
    },
  },
})
