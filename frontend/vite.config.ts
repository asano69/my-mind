import { defineConfig } from "vite";
import { resolve } from "path";

// Two entry points are needed:
//   - my-mind: the main app, loaded by index.html
//   - toast:   loaded standalone (as a plain <script type="module">) by
//              catalog.html and other pages that don't load the full app
export default defineConfig({
  root: "src",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "../internal/handler/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "my-mind": resolve(__dirname, "src/my-mind.ts"),
        toast: resolve(__dirname, "src/ui/toast.ts"),
      },
      output: {
        // Fixed filenames on purpose: Go templates reference these by
        // exact name, and a content-hash/manifest isn't needed here.
        entryFileNames: "[name].js",
      },
    },
  },
});
