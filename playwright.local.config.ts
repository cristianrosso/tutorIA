import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

loadEnvFile(".env.local");
if (process.env.SUPABASE_URL !== "http://127.0.0.1:56431") {
  throw new Error(
    "Esta prueba solo puede utilizar Supabase local del tutor (56431).",
  );
}
export default defineConfig({
  testDir: "./tests/e2e/local",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:56440",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "supabase-local", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 56440",
    url: "http://127.0.0.1:56440/login",
    reuseExistingServer: false,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY!,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY!,
    },
  },
});
