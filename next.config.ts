import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-side PDF rendering (drawing-set analysis) uses pdf.js with a native
  // canvas; load both from node_modules instead of bundling them.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
