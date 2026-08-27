import { createRequire } from "node:module";
import path from "node:path";

import nextra from "nextra";

const require = createRequire(import.meta.url);
const remarkMermaidMermaid = path.join(
  path.dirname(require.resolve("@theguild/remark-mermaid/package.json")),
  "dist",
  "mermaid.js",
);

const withNextra = nextra({});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  turbopack: {
    resolveAlias: {
      "@theguild/remark-mermaid/mermaid": remarkMermaidMermaid,
    },
  },
};

export default withNextra(nextConfig);
