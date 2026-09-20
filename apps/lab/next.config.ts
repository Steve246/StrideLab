import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the Next.js dev indicator from covering the dashboard controls.
  devIndicators: false,
  output: "standalone",
  // Vega pulls optional Node `canvas` via vega-canvas; Lab only needs browser SVG.
  serverExternalPackages: ["vega", "vega-lite", "vega-embed"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    // The Lab imports agent package source directly. Those files use ESM
    // `.js` specifiers that map to `.ts` sources, so teach webpack to resolve
    // the TypeScript file before falling back to JavaScript.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
