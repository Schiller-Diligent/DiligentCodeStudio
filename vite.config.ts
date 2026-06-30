/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],

  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5173,
        }
      : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/.dcs-backups/**",
        "**/.dcs-webview2-*/**",
        "**/target/**",
      ],
    },
  },
}));