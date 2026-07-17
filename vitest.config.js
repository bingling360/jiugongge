import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.js"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    reporters: ["default"]
  }
});
