import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
