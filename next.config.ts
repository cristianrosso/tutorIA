import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "media-src 'self' blob: data:",
      "connect-src 'self' https://*.supabase.co https://api.openai.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Pragma", value: "no-cache" },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/admin/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/analitica",
        headers: noStoreHeaders,
      },
      {
        source: "/progreso",
        headers: noStoreHeaders,
      },
      {
        source: "/tutor",
        headers: noStoreHeaders,
      },
      {
        source: "/tutor/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/simulacro",
        headers: noStoreHeaders,
      },
      {
        source: "/practica",
        headers: noStoreHeaders,
      },
      {
        source: "/clase",
        headers: noStoreHeaders,
      },
      {
        source: "/plan-estudio",
        headers: noStoreHeaders,
      },
      {
        source: "/recomendaciones",
        headers: noStoreHeaders,
      },
    ];
  },
};
export default config;
