/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const enableStandalone =
  process.env.NODE_ENV === 'production' &&
  (process.platform !== 'win32' || process.env.NEXT_STANDALONE === 'true');

const nextConfig = {
  // 生产环境默认使用 standalone 模式（Vercel/Docker/Zeabur）
  // Windows 本地构建默认关闭，避免 symlink 权限错误，可通过 NEXT_STANDALONE=true 强制开启
  ...(enableStandalone ? { output: 'standalone' } : {}),

  reactStrictMode: false,

  // Next.js 16 使用 Turbopack，配置 SVG 加载
  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // Uncoment to add domain whitelist
  images: {
    qualities: [75, 85, 100],
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
