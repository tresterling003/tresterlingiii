/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // AI model files (Background Remover) are treated as assets.
  assetsInclude: ['**/*.onnx'],
  resolve: {
    // "@/components/..." is a shortcut for "src/components/...".
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
