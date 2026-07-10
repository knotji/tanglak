import type { NextConfig } from "next";

// pdfjs-dist reaches for `@napi-rs/canvas` via a dynamically-constructed
// require() (see the comment in src/lib/import/pdf/pdf-text-extractor.ts),
// which Next's output file tracer can't follow statically. Force-include the
// package and its Linux native binary (the platform Vercel builds/runs on)
// for every route that can execute PDF statement parsing, so the serverless
// function bundle actually contains them instead of failing at runtime with
// MODULE_NOT_FOUND. Keyed patterns are substring-matched against the built
// route path, so "/history-import" also covers its dynamic child routes
// (e.g. /history-import/[batchId]/review).
const pdfCanvasTraceIncludes = [
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
  "./node_modules/pdfjs-dist/**/*",
];

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/history-import": pdfCanvasTraceIncludes,
    "/history-import/**": pdfCanvasTraceIncludes,
  },
};

export default nextConfig;
