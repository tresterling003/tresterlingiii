import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built site run from any folder (GitHub Pages subpath, Netlify, a school server).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
