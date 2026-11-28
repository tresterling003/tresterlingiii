import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// EARSHOT_BASE lets the app live under a sub-path, e.g. /earshot/ on Christmas HQ's site.
export default defineConfig({ base: process.env.EARSHOT_BASE || '/', plugins: [react()] });
