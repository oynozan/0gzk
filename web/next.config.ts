import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// web/ imports workspace packages and circuits/index.json from the repo root,
// so file tracing has to start there or the standalone bundle misses them.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig: NextConfig = {
  // Self-contained server at .next/standalone — no node_modules on the host.
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  serverExternalPackages: ["snarkjs", "@0gfoundation/0g-ts-sdk"],
  experimental: {
    optimizePackageImports: ["@0gzk/sdk"],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        worker_threads: false,
        readline: false,
      };
    }
    return config;
  },
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/empty.ts" },
      path: { browser: "./lib/empty.ts" },
      readline: { browser: "./lib/empty.ts" },
    },
  },
};

export default nextConfig;
