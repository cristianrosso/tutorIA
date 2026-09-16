import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e/auth",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3011", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/fixtures/supabase-mock.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
    },
    {
      command:
        "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3011",
      url: "http://127.0.0.1:3011/login",
      reuseExistingServer: false,
      env: {
        SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_PUBLISHABLE_KEY: "test-publishable-fixture",
        SUPABASE_SECRET_KEY: "test-service-fixture",
        AUTH_USERNAME_DOMAIN: "test.invalid",
      },
    },
  ],
});
