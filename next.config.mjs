/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for the Docker image; `next start` locally otherwise.
  ...(process.env.STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
