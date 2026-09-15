import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", ".next/**", "**/.next/**", "dist/**", "**/dist/**", ".turbo/**", "apps/server/.venv/**", "**/*.js", "coverage/**", "htmlcov/**"]
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: false
      }
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off"
    }
  }
);
