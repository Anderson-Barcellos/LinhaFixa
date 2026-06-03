import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Normalize APP_BASE_PATH into a Vite `base` ('/', or '/gaze/' style).
// Lets the SAME build serve at the domain root OR under a sub-path (e.g. /gaze on
// ultrassom.ai) by setting the APP_BASE_PATH env. Must match the value used by the
// Node server at runtime (see server.ts) and the Apache ProxyPass prefix.
function normalizeBase(v?: string): string {
  if (!v || v === '/') return '/';
  return '/' + v.replace(/^\/+|\/+$/g, '') + '/';
}

export default defineConfig(() => {
  return {
    base: normalizeBase(process.env.APP_BASE_PATH),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
