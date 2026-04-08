import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "sqlite-vec-linux-x64",
  ],
};

export default nextConfig;
