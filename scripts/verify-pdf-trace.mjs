#!/usr/bin/env node
/**
 * Verifies that Next.js's output file tracing actually included the
 * `@napi-rs/canvas` runtime (and its Linux native binary, when present in
 * node_modules on the machine running the build) plus `pdfjs-dist`'s
 * supporting files (cmaps, standard fonts, worker) in the serverless
 * function bundle for every History Import route.
 *
 * pdfjs-dist's legacy Node build reaches for `@napi-rs/canvas` via a
 * dynamically-constructed `require()`, which Next's static tracer can't
 * follow on its own — this script exists so a silent regression (someone
 * removing the `outputFileTracingIncludes` entry in next.config.ts, or a
 * pdfjs-dist upgrade changing its internal require pattern) fails a build
 * step instead of only surfacing as a production MODULE_NOT_FOUND.
 *
 * Run after `npm run build`:
 *   node scripts/verify-pdf-trace.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nftFiles = [
  ".next/server/app/history-import/page.js.nft.json",
  ".next/server/app/history-import/[batchId]/review/page.js.nft.json",
  ".next/server/app/history-import/[batchId]/summary/page.js.nft.json",
];

const linuxBinaryLocallyAvailable = existsSync(
  join(projectRoot, "node_modules/@napi-rs/canvas-linux-x64-gnu"),
);

let hasFailure = false;
const report = [];

for (const relPath of nftFiles) {
  const fullPath = join(projectRoot, relPath);
  if (!existsSync(fullPath)) {
    hasFailure = true;
    report.push(`FAIL  ${relPath}: trace file not found (did you run "npm run build" first?)`);
    continue;
  }

  const data = JSON.parse(readFileSync(fullPath, "utf8"));
  const files = data.files ?? [];

  const napiCanvasCore = files.filter((f) => f.includes("@napi-rs/canvas/"));
  const napiCanvasLinux = files.filter((f) => f.includes("@napi-rs/canvas-linux-x64-gnu"));
  const pdfjs = files.filter((f) => f.includes("pdfjs-dist/"));
  const pdfjsWorker = pdfjs.filter((f) => f.includes("pdf.worker"));
  const pdfjsCmaps = pdfjs.filter((f) => f.includes("cmaps/"));

  const checks = [
    ["@napi-rs/canvas core files", napiCanvasCore.length > 0],
    ["pdfjs-dist files", pdfjs.length > 0],
    ["pdfjs-dist worker file", pdfjsWorker.length > 0],
    ["pdfjs-dist cmaps", pdfjsCmaps.length > 0],
  ];

  if (linuxBinaryLocallyAvailable) {
    checks.push(["@napi-rs/canvas-linux-x64-gnu (Linux native binary)", napiCanvasLinux.length > 0]);
  }

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    hasFailure = true;
    report.push(`FAIL  ${relPath}:`);
    for (const [label] of failed) report.push(`        missing: ${label}`);
  } else {
    report.push(
      `OK    ${relPath}: canvas=${napiCanvasCore.length} files, canvas-linux-x64-gnu=${napiCanvasLinux.length} files, pdfjs-dist=${pdfjs.length} files (worker=${pdfjsWorker.length}, cmaps=${pdfjsCmaps.length})`,
    );
  }
}

console.log(report.join("\n"));

if (!linuxBinaryLocallyAvailable) {
  console.log(
    "\nNOTE: @napi-rs/canvas-linux-x64-gnu is not present in local node_modules " +
      "(expected on non-Linux dev machines — npm only installs the optional " +
      "dependency variant matching the current platform). The Linux-binary " +
      "check was skipped here; it must be re-run in the actual Vercel/Linux " +
      "build environment, or with node_modules populated from a Linux install, " +
      "to fully confirm.",
  );
}

if (hasFailure) {
  console.error("\nPDF trace verification FAILED.");
  process.exit(1);
} else {
  console.log("\nPDF trace verification passed.");
}
