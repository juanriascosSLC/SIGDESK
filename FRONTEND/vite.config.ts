import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3003,
    host: true,
    proxy: {
      // Keep SIG-DESK API calls same-origin in local development. Kong's
      // production routes do not need to expose permissive browser CORS.
      '/__sigdesk': {
        target: process.env.SIGDESK_DEV_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__sigdesk/, ''),
      },
      // Keep corporate authentication same-origin during local development.
      // SIGTools does not allow arbitrary localhost origins and redirects HTTP
      // to HTTPS, which browsers reject for CORS preflight requests.
      '/__sigtools': {
        target: process.env.SIGTOOLS_DEV_PROXY_TARGET || 'https://api.sig.systems:8091',
        changeOrigin: true,
        secure: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__sigtools/, ''),
      },
    },
  },
});
