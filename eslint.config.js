// Strict ESLint config — CI runs with --max-warnings 0, so every rule
// here is effectively an error. See CONTRIBUTING.md for the standards
// these enforce.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "target", "src-tauri", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The 400-line rule: files must stay readable in one sitting.
      "max-lines": ["error", { max: 400, skipBlankLines: false, skipComments: false }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["*.config.js", "*.config.ts"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
);
