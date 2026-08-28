import js from "@eslint/js";
import solid from "eslint-plugin-solid/configs/recommended";
import globals from "globals";

// Flat config (ESLint 9+). Only src/ is linted; build output and
// node_modules are excluded by default (no need to list them here).
export default [
  js.configs.recommended,
  solid,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // The codebase's convention for an intentionally-unused parameter
      // (e.g. a base-class method signature that a subclass overrides,
      // or an event handler that ignores its event) is to prefix it
      // with "_" -- see layout.js's getChildDirection(_child) and
      // newMouse.js's onDragEnd(_e). Recognize that convention instead
      // of flagging every one of these individually.
      "no-unused-vars": [
        "error",
        { args: "after-used", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Enforces the engine/app boundary from docs/mind-map-core-engine-library.md
    // (Step 1): core/** is meant to become a standalone library with no
    // knowledge of this host app, so it must never import store.js (app
    // state), ui/* (PocketBase persistence, notes editor), backend/*
    // (PocketBase client), or title.js (browser tab title). Catching this
    // as a lint error, rather than a convention someone has to remember to
    // uphold, is the whole point of this step -- see that doc for the full
    // rationale and the phased plan this kicks off. Only core/scope.js is
    // expected to violate this today (its `activeMode` import from
    // store.js); Step 2 fixes that by inverting the dependency.
    files: ["src/lib/mindmap/core/**/*.{js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/store.js"],
              message:
                "core/** must not import store.js (app state) -- accept it as a parameter or callback instead. See docs/mind-map-core-engine-library.md.",
            },
            {
              group: ["**/ui/*", "**/ui/**"],
              message:
                "core/** must not import ui/* (app-specific persistence/notes UI). See docs/mind-map-core-engine-library.md.",
            },
            {
              group: ["**/backend/*", "**/backend/**"],
              message:
                "core/** must not import backend/* (PocketBase client) directly. See docs/mind-map-core-engine-library.md.",
            },
            {
              group: ["**/title.js"],
              message:
                "core/** must not import title.js (document.title is a browser-tab concern, not the engine's). See docs/mind-map-core-engine-library.md.",
            },
          ],
        },
      ],
    },
  },
];
