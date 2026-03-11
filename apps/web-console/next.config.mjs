/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@flogo-agent/contracts"],
  eslint: {
    // Workspace linting is handled outside `next build`.
    ignoreDuringBuilds: true
  },
  typescript: {
    // Workspace `pnpm typecheck` is the authoritative type gate.
    ignoreBuildErrors: true
  },
  experimental: {
    // Avoid a separate webpack build worker in constrained environments.
    webpackBuildWorker: false
  }
};

export default nextConfig;
