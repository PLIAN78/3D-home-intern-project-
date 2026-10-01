// Copy pdf.js's worker into /public so the browser loads it as a static file
// (keeps pdfjs-dist server-external without bundler warnings).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
mkdirSync("public", { recursive: true });
copyFileSync(src, path.join("public", "pdf.worker.min.mjs"));
