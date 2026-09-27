import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["unpdf", "mammoth", "fflate"],
  outputFileTracingIncludes: {
    "/*": ["./db/migrations/**/*"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals;
      if (Array.isArray(externals)) externals.push("node:sqlite");
    }
    return config;
  },
};

export default nextConfig;
