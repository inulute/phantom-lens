// vite.config.ts
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // main.ts
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      {
        // preload.ts
        entry: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    ]),
  ],
  server: {
    port: 54321,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
