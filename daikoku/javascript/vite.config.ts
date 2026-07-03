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
    // allowedHosts: ['daikoku.oto.tools'],
    watch: {
      usePolling: true,
    },
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
