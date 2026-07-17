const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "python3 tests/e2e/server.py",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } }
  ]
});
