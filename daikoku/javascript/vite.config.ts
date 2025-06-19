import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import fs from 'fs';
import path from 'path';

import https from 'https';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const proxyTarget = 'http://localhost:9000';

const secureProxy = {
  target: proxyTarget,
  // changeOrigin: true,
  // secure: false,
  // agent: httpsAgent,
};


// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'process.env': process.env
  },
  publicDir: "public",
  server: {
    https: {
      key: fs.readFileSync(path.resolve(process.env.HOME || '', '/Users/76885k/daikoku.oto.tools+3-key.pem')),
      cert: fs.readFileSync(path.resolve(process.env.HOME || '', '/Users/76885k/daikoku.oto.tools+3.pem')),
    },
    host: '0.0.0.0', // Accepte les connexions externes
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'wss',
      host: 'daikoku.oto.tools',
      port: 5173,
    },
    allowedHosts: ['daikoku.oto.tools'],
    watch: {
      usePolling: true,
    },
    proxy: {
      '/_': secureProxy,
      '/cms': secureProxy,
      '/asset-thumbnails': secureProxy,
      '/team-assets': secureProxy,
      '/api/': secureProxy,
      '/admin-api': secureProxy,
      '/cms-api': secureProxy,
      '/account': secureProxy,
      '/tenant-assets': secureProxy,
      '/auth/Local/callback': secureProxy,
      '/auth/LDAP/callback': secureProxy,
      '/auth/oauth2/callback': secureProxy,
      '/login/oauth2/callback': secureProxy,
      '/auth/oauth2/login': secureProxy,
      '/auth/OAuth2/login': secureProxy,
      '/auth/passkey/begin': secureProxy,
      '/auth/passkey/complete': secureProxy,
      '/logout': secureProxy,
      '/assets': secureProxy,
      '/robots.txt': secureProxy,
      '/health': secureProxy,
      '/status': secureProxy,
      '/user-avatar': secureProxy,
      '^/$': secureProxy
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      plugins: [
        visualizer()
      ],
      input: {
        index: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          highlight: ['highlight.js'],
          asyncapi: ['@asyncapi/react-component'],
          swagger: ['swagger-ui-dist'],
          asciidoctor: ['asciidoctor'],
          backofffice: ['@maif/react-forms', 'xstate', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities']
        },
      }
    },
    minify: "terser",
    terserOptions: {
      format: {
        keep_quoted_props: true
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    }
  }
});
