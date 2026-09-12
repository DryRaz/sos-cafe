/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdfkit resolves its standard fonts via Node subpath imports
    // (e.g. "#standard-fonts/Helvetica"), which webpack cannot bundle
    // correctly for the serverless function — it fails at runtime with
    // "Package import specifier ... is not defined". Keeping pdfkit as an
    // external package makes Next.js load it with a plain require() from
    // node_modules instead, where that resolution works as intended.
    serverComponentsExternalPackages: ['pdfkit'],
    // pdfkit loads those font files via `createRequire(...)('#standard-fonts/X')`
    // at runtime (not a plain `require("...")` literal), so Vercel's static
    // file tracer (@vercel/nft) doesn't detect them and leaves them out of the
    // deployed function bundle. Force-include them explicitly so the font
    // files actually exist on disk in production.
    outputFileTracingIncludes: {
      '/api/orders/daily-report': ['node_modules/pdfkit/js/standard-fonts/**/*'],
    },
  },
};

export default nextConfig;
