import { defineConfig } from "vite";
import { resolve } from "path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// Two HTML entry points:
//   - index.html:  the Solid.js SPA
//   - editor.html: the notes editor, loaded standalone in an <iframe>
export default defineConfig({
  plugins: [solid(), tailwindcss()],
  publicDir: resolve(__dirname, "public"),
  server: {
    host: "0.0.0.0",
    port: 3001,
    allowedHosts: true,
    proxy: {
      // All map storage now goes through the PocketBase API.
      "^/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../internal/assets/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        editor: resolve(__dirname, "editor.html"),
      },
    },
  },
});
