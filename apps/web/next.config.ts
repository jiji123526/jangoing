import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    useTypeScriptCli: false,
  },
  transpilePackages: ["@jangoing/contracts"],
};

export default nextConfig;
