import { execSync } from "node:child_process";

const fallback = "postgresql://xiami:xiami@127.0.0.1:5432/xiami_test";

export default function setup() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:")) {
    process.env.DATABASE_URL = fallback;
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
}
