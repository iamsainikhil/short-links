import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(process.cwd(), 'src');
    return config;
  },
};

export default nextConfig;
