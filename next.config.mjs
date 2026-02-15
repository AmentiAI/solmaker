import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@omnisat/lasereyes', '@omnisat/lasereyes-core', '@omnisat/lasereyes-react'],
  reactStrictMode: false,
  webpack: (config, { isServer }) => {
    // Fix for LaserEyes and other packages that have module resolution issues
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    
    // Fix for pino-pretty optional dependency issue with WalletConnect
    config.resolve.alias = {
      ...config.resolve.alias,
      'pino-pretty': false,
    }
    
    return config
  },
}

export default nextConfig