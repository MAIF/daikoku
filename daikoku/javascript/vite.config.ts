import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from 'vite';


// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'process.env': process.env
  },
  publicDir: "public",
  server: {
    // host: '0.0.0.0', // Accepte les connexions externes
    // port: 5173,
    // strictPort: true,
    // hmr: {
    //   host: '*.oto.tools',
    //   port: 5173,
    // },
    // allowedHosts: ['test.oto.tools'],
    // watch: {
    //   usePolling: true,
    // },
    proxy: {
      "/_": "http://localhost:9000",
      "/cms": "http://localhost:9000",
      "/asset-thumbnails": "http://localhost:9000",
      "/team-assets": "http://localhost:9000",
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
      "/user-avatar": "http://localhost:9000",
      "^/$": "http://localhost:9000",
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
    } as any
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    }
  }
});
