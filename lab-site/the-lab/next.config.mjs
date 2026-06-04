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

// SEC-25: HTTP security headers / transport hardening. The headers below are
// enforced (they don't affect rendering). The Content-Security-Policy is shipped
// **Report-Only** because a strict enforced CSP can break the app (Next's inline
// bootstrap scripts, Square Web Payments, reCAPTCHA) and must be validated
// against staging (§7 DAST) before flipping to the enforcing header.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Baseline CSP reflecting the app's real sources (S3 uploads, OAuth avatar CDNs,
// Square Web Payments, Google reCAPTCHA). Shipped as Report-Only; tune from
// staging violation reports, then promote to `Content-Security-Policy`.
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://s3.crittercodes.dev https://cdn.discordapp.com https://*.googleusercontent.com https://images.unsplash.com",
  // 'unsafe-inline' is required until Next is configured with per-request nonces.
  "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://*.squarecdn.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://connect.squareup.com https://pci-connect.squareup.com https://*.squarecdn.com https://www.google.com",
  "frame-src 'self' https://www.google.com https://*.squarecdn.com",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosting on Coolify: emit a standalone server bundle (.next/standalone) so the
  // Dockerfile can ship a lean runtime image. No-op on Vercel; this copy isn't deployed there.
  output: "standalone",
  // Silence the Turbopack error since we are using a Webpack plugin (next-pwa)
  // PWA is disabled in dev mode anyway, so Turbopack should be fine for dev.
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicyReportOnly },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
