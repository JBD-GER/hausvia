import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./public/hausvia-logo-pdf.jpg"],
  },
  experimental: {
    serverActions: {
      // Vercel rejects Function requests above 4.5 MB before an Action runs.
      // Leave enough room above the 4 MiB application file limit for multipart
      // boundaries and the encrypted Server Action metadata.
      bodySizeLimit: "4.25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/meldung/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/buildings/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
