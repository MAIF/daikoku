import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
  publicDir: "public",
  server: {
    proxy: {
      "/api/": "http://localhost:9000",
      "/account": "http://localhost:9000",
      "/auth/Local/callback": "http://localhost:9000",
      "/logout": "http://localhost:9000",
      "/assets": "http://localhost:9000",
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      plugins: [visualizer()],
      input: {
        index: resolve(__dirname, 'index.html'),
      }
    },
    minify: "terser",
    terserOptions: {
      format: {
        keep_quoted_props: true
      }
    }
  }
});
