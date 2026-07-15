import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.js: the unit tests added here
// are plain JS/DOM-free and don't need the Solid/Tailwind plugins, so
// keeping this config minimal avoids coupling test setup to the app build.
export default defineConfig({
  test: {
    environment: "node",
  },
});
