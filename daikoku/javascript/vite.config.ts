import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";


// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'process.env': process.env
  },
  publicDir: "public",
  server: {
    proxy: {
      "/_": "http://localhost:9000",
      "/cms": "http://localhost:9000",
      "/api/": "http://localhost:9000",
      "/admin-api": "http://localhost:9000",
      "/cms-api": "http://localhost:9000",
      "/account": "http://localhost:9000",
      "/tenant-assets": "http://localhost:9000",
      "/auth/Local/callback": "http://localhost:9000",
      "/auth/LDAP/callback": "http://localhost:9000",
      "/auth/oauth2/callback": "http://localhost:9000",
      "/login/oauth2/callback": "http://localhost:9000",
      "/auth/oauth2/login": "http://localhost:9000",
      "/auth/OAuth2/login": "http://localhost:9000",
      "/logout": "http://localhost:9000",
      "/assets": "http://localhost:9000",
      "/robots.txt": "http://localhost:9000",
      "/health": "http://localhost:9000",
      "/status": "http://localhost:9000",
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
