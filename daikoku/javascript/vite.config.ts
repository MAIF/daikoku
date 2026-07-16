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
    host: '0.0.0.0', // Accepte les connexions externes
    port: 5173,
    strictPort: true,
    hmr: {
      host: '*.oto.tools',
      port: 5173,
    },
    allowedHosts: ['maif.oto.tools'],
    watch: {
      usePolling: true,
    },
    proxy: {
      "/_": {target: "http://localhost:9000", changeOrigin: false},
      "/cms": {target: "http://localhost:9000", changeOrigin: false},
      "/asset-thumbnails": {target: "http://localhost:9000", changeOrigin: false},
      "/team-assets": {target: "http://localhost:9000", changeOrigin: false},
      "/api/": {target: "http://localhost:9000", changeOrigin: false},
      "/admin-api": {target: "http://localhost:9000", changeOrigin: false},
      "/cms-api": {target: "http://localhost:9000", changeOrigin: false},
      "/account": {target: "http://localhost:9000", changeOrigin: false},
      "/tenant-assets": {target: "http://localhost:9000", changeOrigin: false},
      "/auth/Local/callback": {target: "http://localhost:9000", changeOrigin: false},
      "/auth/LDAP/callback": {target: "http://localhost:9000", changeOrigin: false},
      "/auth/oauth2/callback": {target: "http://localhost:9000", changeOrigin: false},
      "/login/oauth2/callback": {target: "http://localhost:9000", changeOrigin: false},
      "/auth/oauth2/login": {target: "http://localhost:9000", changeOrigin: false},
      "/auth/OAuth2/login": {target: "http://localhost:9000", changeOrigin: false},
      "/logout": {target: "http://localhost:9000", changeOrigin: false},
      "/assets": {target: "http://localhost:9000", changeOrigin: false},
      "/robots.txt": {target: "http://localhost:9000", changeOrigin: false},
      "/health": {target: "http://localhost:9000", changeOrigin: false},
      "/status": {target: "http://localhost:9000", changeOrigin: false},
      "/user-avatar": {target: "http://localhost:9000", changeOrigin: false},
      "^/$": {target: "http://localhost:9000", changeOrigin: false},
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
        manualChunks(id) {
          if (id.includes('node_modules/highlight.js')) return 'highlight';
          if (id.includes('node_modules/@asyncapi/react-component')) return 'asyncapi';
          if (id.includes('node_modules/swagger-ui-dist')) return 'swagger';
          if (id.includes('node_modules/asciidoctor')) return 'asciidoctor';
          if (
            id.includes('node_modules/@maif/react-forms') ||
            id.includes('node_modules/xstate') ||
            id.includes('node_modules/@dnd-kit/')
          ) {
            return 'backofffice';
          }
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
    include: ['react-paginate'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    }
  }
});
