import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// The same API handler runs inside `vite dev`/`vite preview` and in the production server (server/index.mjs),
// so AI keys always stay server-side and there is only one implementation to maintain.
// @ts-expect-error - plain ESM module without type declarations
import { createApiHandler } from './server/api.mjs';

function posePilotApi(): Plugin {
  const mount = (middlewares: Connect.Server) => {
    const handler = createApiHandler(process.env);
    middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/api/')) return handler(req, res);
      next();
    });
  };
  return {
    name: 'posepilot-api',
    configureServer(server) { mount(server.middlewares); },
    configurePreviewServer(server) { mount(server.middlewares); },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), posePilotApi()],
  server: { host: true },
  build: { chunkSizeWarningLimit: 900 },
});
