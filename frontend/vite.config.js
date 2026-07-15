// frontend/vite.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// Three entry points are needed:
//   - main:   the Solid.js SPA, loaded by index.html
//   - server: the legacy vanilla-JS mind-map engine, still loaded standalone
//             by src/my-mind.js until Phase 3 moves it under src/lib/mindmap/
//   - toast:  loaded standalone (as a plain <script type="module">) by
//             catalog.html and other pages that don't load the full app
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  publicDir: resolve(__dirname, "public"),
  server: {
    host: "0.0.0.0",
    port: 3001,
    allowedHosts: true,
    proxy: {
      // All map storage now goes through the PocketBase API.
      "^/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
  build: {
    outDir: resolve(__dirname, "../internal/handler/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        server: resolve(__dirname, "src/my-mind.js"),
        toast: resolve(__dirname, "src/ui/toast.js"),
      },
      output: {
        // server/toast keep fixed filenames because the legacy Go templates
        // reference them by exact name; the Solid entry can use normal
        // content-hashed asset names.
        entryFileNames: (chunk) =>
          chunk.name === "server" || chunk.name === "toast"
            ? "[name].js"
            : "assets/[name]-[hash].js",
      },
    },
  },
});

// outDir: internal/handler/dist と internal/assets/assets.go がembedしている internal/assets/dist の不一致 → Phase 5で対応
// frontend/src/index.html（旧vanilla JS版のエントリ）→ Phase 3で削除
