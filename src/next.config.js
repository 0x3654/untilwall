/** @type {import('next').NextConfig} */
const isExport = process.env.EXPORT === '1';

const nextConfig = {
  reactStrictMode: true,
  ...(isExport
    ? {
        // Static export for the Rust backend: the API routes (/goal, /api/*)
        // and middleware are owned by the Rust server and must be removed
        // from the source tree before running `EXPORT=1 next build`
        // (see Dockerfile.rust). Only the client UI ships as static files.
        output: 'export',
        images: { unoptimized: true },
      }
    : {
        output: 'standalone',
      }),
};

module.exports = nextConfig;
