import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@google-cloud/tasks',
    '@google-cloud/firestore',
    'googleapis',
  ],
};

export default nextConfig;
