import { defaultClientConditions, defineConfig } from "vite";
import { resolve } from "node:path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solid(), tailwindcss()],
  resolve: {
    conditions: defaultClientConditions.filter(
      (condition) => condition !== "development|production",
    ),
    alias: {
      // unified / micromark 在 development 条件下会走到 debug 的浏览器实现，
      // 但 debug@4 的 browser.js 没有默认导出，导致前端直接白屏。
      debug: resolve(__dirname, "src/shims/debug.ts"),
      extend: resolve(__dirname, "src/shims/extend.ts"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
}));
