import { defineConfig } from "vite";

// The 0G Storage indexer doesn't set CORS headers, so a browser page on
// http://localhost:5173 can't fetch from it directly. In dev, Vite proxies
// /0g-storage/* -> https://indexer-storage-testnet-turbo.0g.ai/* on our
// behalf. The browser still does the fetch — the proxy just rewrites the
// origin so CORS doesn't apply. For production deployments you'll need a
// thin proxy of your own (Cloudflare Worker, a Next.js route, anything that
// re-emits Access-Control-Allow-Origin).
export default defineConfig({
  server: {
    proxy: {
      "/0g-storage": {
        target: "https://indexer-storage-testnet-turbo.0g.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/0g-storage/, ""),
        secure: true,
      },
    },
  },
  optimizeDeps: {
    // snarkjs ships some CommonJS bits Vite needs to pre-bundle.
    include: ["snarkjs", "ethers", "@0gzk/sdk", "fflate"],
  },
});
