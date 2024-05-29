"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vite_1 = require("vite");
const path_1 = require("path");
const plugin_react_1 = __importDefault(require("@vitejs/plugin-react"));
const rollup_plugin_visualizer_1 = require("rollup-plugin-visualizer");
// https://vitejs.dev/config/
exports.default = (0, vite_1.defineConfig)({
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
    plugins: [(0, plugin_react_1.default)()],
    build: {
        rollupOptions: {
            plugins: [(0, rollup_plugin_visualizer_1.visualizer)()],
            input: {
                index: (0, path_1.resolve)(__dirname, 'index.html'),
            },
            output: {
                assetFileNames: (assetInfo) => {
                    let extType = assetInfo.name.split('.').at(1);
                    if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
                        extType = 'img';
                    }
                    return `assets/assets/[name]-[hash][extname]`;
                },
                chunkFileNames: 'assets/assets/[name]-[hash].js',
                entryFileNames: 'assets/assets/[name]-[hash].js',
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
