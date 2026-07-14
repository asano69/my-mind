// frontend/vite.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";

// Two entry points are needed:
//   - my-mind: the main app, loaded by index.html
//   - toast:   loaded standalone (as a plain <script type="module">) by
//              catalog.html and other pages that don't load the full app
export default defineConfig({
  root: "src",
  publicDir: resolve(__dirname, "public"),
  server: {
    host: "0.0.0.0",
    port: 3001,
    allowedHosts: true,
    proxy: {
      // Only the WebDAV-style data endpoint needs the Go backend now; "/" and
      // "/m/*" are served by Vite itself (src/index.html — the vanilla-JS
      // editor) via its default SPA fallback, until Solid.js replaces it.
      // "/catalog" is intentionally still broken (CLAUDE.md: not essential yet).
      "^/catalog$": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "^/maps/": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
  build: {
    outDir: resolve(__dirname, "../internal/handler/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        server: resolve(__dirname, "src/my-mind.js"),
        toast: resolve(__dirname, "src/ui/toast.js"),
      },
      output: {
        // Fixed filenames on purpose: Go templates reference these by
        // exact name, and a content-hash/manifest isn't needed here.
        entryFileNames: "[name].js",
      },
    },
  },
});
