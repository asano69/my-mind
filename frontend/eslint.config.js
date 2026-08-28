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
];
