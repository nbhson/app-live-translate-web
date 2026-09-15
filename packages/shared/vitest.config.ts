import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      include: ["src/**/*.ts"]
    }
  }
});
