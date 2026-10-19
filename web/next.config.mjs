/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/card": ["./assets/fonts/**"],
  },
};

export default nextConfig;
