import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  reactPlugin.configs.flat["jsx-runtime"],
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
      react: reactPlugin,
      "react-hooks": reactHooks
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: {
          jsx: true
        },
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        React: "readonly",
        process: "readonly",
        NodeJS: "readonly"
      }
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      // TypeScript rules
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" }
      ],

      // Prettier rules
      ...prettierConfig.rules,
      "prettier/prettier": "error",

      // React rules
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/prop-types": "off", // Disable prop-types checking since we're using TypeScript
      "react/require-default-props": "off" // Also commonly disabled with TypeScript
    }
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**"]
  }
];
