import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Live mode reads these at request time.
  outputFileTracingIncludes: { "/api/run": ["./data/qbo/**", "./config/**", "./prompts/**", "./cache/**"] },
  cacheComponents: true,
  partialPrefetching: true,
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
