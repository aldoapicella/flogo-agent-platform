import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@flogo-agent/contracts"]
};

export default nextConfig;

