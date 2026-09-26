import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Calls: a fake camera and microphone, allowed without a prompt.
        permissions: ["camera", "microphone"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--allow-loopback-in-peer-connection"] },
      },
    },
  ],
  webServer: {
    command: `next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/intune_e2e`,
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000",
      INTUNE_E2E_GEMINI_STUB: "1",
      BLOB_READ_WRITE_TOKEN: "",
      // Local LiveKit dev server (`livekit-server --dev`); its well-known dev credentials.
      LIVEKIT_URL: process.env.E2E_LIVEKIT_URL ?? "ws://localhost:7880",
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "secret",
    },
  },
});
