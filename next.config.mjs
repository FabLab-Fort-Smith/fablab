import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence the Turbopack error since we are using a Webpack plugin (next-pwa)
  // PWA is disabled in dev mode anyway, so Turbopack should be fine for dev.
  turbopack: {}, 
};

export default withPWA(nextConfig);
