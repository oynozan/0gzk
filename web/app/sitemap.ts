import type { MetadataRoute } from "next";

const BASE = "https://0gzk.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/ai", "/prove", "/inspect", "/whitepaper"].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly",
  }));
}
