import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs", "@aws-sdk/client-s3", "@google-cloud/storage"],
  experimental: {
    proxyClientMaxBodySize: "80mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
