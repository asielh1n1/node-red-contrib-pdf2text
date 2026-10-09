"use strict";

/**
 * Smoke test for the pdf2text node runtime (no Node-RED required).
 * Usage: node test/smoke.js [path-to.pdf]
 */

const path = require("node:path");
const fs = require("node:fs");
const { extractText, getDocumentProxy } = require("unpdf");

const pdfPath = process.argv[2] || "D:/Work/test/Vector fiscal.pdf";

(async () => {
  if (!fs.existsSync(pdfPath)) {
    console.warn(`! PDF not found, skipping: ${pdfPath}`);
    process.exit(0);
  }

  const bytes = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });

  console.log(`OK  file: ${path.basename(pdfPath)}`);
  console.log(`OK  pages: ${totalPages}`);
  console.log(`OK  chars: ${text.length}`);
  console.log("--- first 200 chars ---");
  console.log(text.slice(0, 200));
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
