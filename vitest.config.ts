import path from "node:path";
import { defineConfig } from "vitest/config";

const databaseUrl =
  process.env.DATABASE_URL && process.env.DATABASE_URL.includes("xiami_test")
    ? process.env.DATABASE_URL
    : "postgresql://xiami:xiami@127.0.0.1:5432/xiami_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: "test-secret-not-for-production",
      STORAGE_DRIVER: "local",
    },
  },
});
