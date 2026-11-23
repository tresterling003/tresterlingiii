// Builds ONE self-contained HTML file (all JS, CSS and fonts inlined) that can be downloaded and opened
// by double-clicking, even offline. AI drawing needs the server, so it shows as "not set up" in this file.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 },
});
