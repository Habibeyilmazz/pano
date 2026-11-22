import { defineConfig, devices } from "playwright/test";

// Runs against a production build (`npm run build` first) on its own empty PGlite database.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4501", trace: "retain-on-failure", locale: "tr-TR", timezoneId: "Europe/Istanbul" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node -e "require('fs').rmSync('.data/e2e',{recursive:true,force:true})" && next start -p 4501`,
    url: "http://localhost:4501/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PANO_DB: ".data/e2e", SCRYPT_LOG_N: "12" },
  },
});
