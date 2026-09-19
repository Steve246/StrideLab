import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Vega pulls optional Node `canvas` via vega-canvas; Lab only needs browser SVG.
  serverExternalPackages: ["vega", "vega-lite", "vega-embed"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
