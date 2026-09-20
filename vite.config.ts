/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/todo-liste/",
  plugins: [
    preact(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "To-Do Liste",
        short_name: "To-Do",
        description: "Gemeinsame To-do-Liste für zwei Personen, offline nutzbar.",
        lang: "de",
        start_url: "/todo-liste/",
        scope: "/todo-liste/",
        display: "standalone",
        background_color: "#f2f2f7",
        theme_color: "#f2f2f7",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: "/todo-liste/index.html",
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
