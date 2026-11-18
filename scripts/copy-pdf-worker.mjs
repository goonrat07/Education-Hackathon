// Copies the pdf.js worker next to the app's static files so the source
// viewer can load it from our own origin. Runs after every install so the
// worker always matches the installed pdfjs-dist version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const worker = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
mkdirSync("public", { recursive: true });
copyFileSync(worker, path.join("public", "pdf.worker.min.mjs"));
console.log("copied pdf.js worker to public/pdf.worker.min.mjs");
