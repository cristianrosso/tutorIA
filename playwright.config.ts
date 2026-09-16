import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/auth/**", "**/local/**"],
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3010", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3010/login",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
    },
  },
});
