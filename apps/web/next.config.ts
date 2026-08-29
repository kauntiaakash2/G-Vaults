import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sih/shared'],
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
