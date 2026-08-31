import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

function resolveAllowedDevOrigins(): string[] {
  const devspaceId = process.env.DEVSPACE_ID?.trim();

  if (!devspaceId) {
    return [];
  }

  try {
    const proxyBaseDomain = readFileSync(
      "/etc/devspace/http-proxy-base-domain",
      "utf8",
    ).trim();

    if (!proxyBaseDomain) {
      return [];
    }

    return [`${devspaceId}--3000.${proxyBaseDomain}`];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: resolveAllowedDevOrigins(),
  experimental: {
    useTypeScriptCli: false,
  },
  transpilePackages: ["@jangoing/contracts"],
};

export default nextConfig;
