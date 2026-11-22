import { defineConfig } from "@playwright/test";

const API_PORT = 8011;
const WEB_PORT = 3011;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: `node ../../scripts/py.mjs -m app --env test --port ${API_PORT} --no-reload`,
      url: `${API_URL}/healthz`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        API_PORT: String(API_PORT),
        APP_ENV: "test",
        OPS_TOKEN: "",
        CORS_ORIGINS: `${WEB_URL},http://localhost:${WEB_PORT},http://localhost:3000,http://127.0.0.1:3000`,
        RATE_LIMIT_PER_MINUTE: "10000",
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT} -H 127.0.0.1`,
      url: WEB_URL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: API_URL,
        // e2e exercises the product, not Clerk's hosted sign-in.
        NEXT_PUBLIC_AUTH_DISABLED: "1",
      },
    },
  ],
});
