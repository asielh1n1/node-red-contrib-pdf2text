"use strict";

/**
 * pdf2text
 * Node-RED node that extracts text from a PDF supplied as a Buffer,
 * Uint8Array or ArrayBuffer, using the `unpdf` library (PDF.js).
 */

module.exports = function (RED) {
  const { getDocumentProxy, extractText } = require("unpdf");

  // The metadata is always written to this fixed property (not configurable).
  const META_PROP = "pdf2text";

  // Property names that must never be used as a message-property path.
  // Writing through them would allow prototype pollution.
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  /**
   * Validates a configured Node-RED message-property path (e.g. "payload" or
   * "foo.bar") and rejects anything that could be abused for prototype
   * pollution. Returns the trimmed path or throws.
   */
  function safePropertyPath(value, label) {
    const path = String(value || "").trim();
    if (!path) return null;
    const segments = path.split(".");
    for (const seg of segments) {
      if (seg === "") continue;
      if (FORBIDDEN_KEYS.has(seg)) {
        throw new Error(
          `Invalid ${label}: "${path}" is not allowed ("${seg}" is a reserved key).`
        );
      }
    }
    return path;
  }

  function Pdf2TextNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Settings resolved at deploy time
    const inputProp = safePropertyPath(config.inputProp, "PDF property") || "payload";
    const outputProp = safePropertyPath(config.outputProp, "Output property") || "payload";
    const firstPage = toPageNumber(config.firstPage);
    const lastPage = toPageNumber(config.lastPage);

    node.on("input", async function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      const startedAt = Date.now();

      // 1) Locate the PDF payload
      const raw = RED.util.getMessageProperty(msg, inputProp);

      // 2) Normalize to Uint8Array
      let bytes;
      try {
        bytes = toUint8Array(raw);
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "invalid input" });
        node.error(err, msg);
        return done && done(err);
      }

      node.status({ fill: "blue", shape: "dot", text: "extracting..." });

      let pdf;
      try {
        pdf = await getDocumentProxy(bytes);

        // unpdf's extractText() extracts the WHOLE document and ignores
        // firstPage/lastPage. We therefore compute the range ourselves and
        // slice the resulting per-page array.
        const total = pdf.numPages;
        let first = firstPage === undefined ? 1 : firstPage;
        let last = lastPage === undefined ? total : lastPage;

        if (first < 1 || last < 1) {
          throw new Error("Page numbers must be 1 or greater (First page / Last page).");
        }
        if (first > total) {
          throw new Error(`First page (${first}) is beyond the last page of the PDF (${total}).`);
        }
        if (last > total) {
          node.warn(`Last page (${last}) is beyond the document (${total}); using ${total}.`);
          last = total;
        }
        if (first > last) {
          throw new Error(`First page (${first}) cannot be greater than Last page (${last}).`);
        }

        // Always extract per page (array), then select the requested range.
        const { text } = await extractText(pdf, { mergePages: false });
        const allPages = Array.isArray(text) ? text : [text];
        const pageTexts = allPages.slice(first - 1, last);

        // Metadata is always written to the fixed `pdf2text` property.
        const meta = {
          success: true,
          totalPages: total,        // pages in the document
          pages: pageTexts.length,  // pages actually extracted
          fromPage: first,
          toPage: last,
          elapsedMs: Date.now() - startedAt
        };
        RED.util.setMessageProperty(msg, META_PROP, meta);

        // Merge the selected pages into a single string (Node-RED page join).
        RED.util.setMessageProperty(msg, outputProp, pageTexts.join("\n\n"));
        node.status({
          fill: "green",
          shape: "dot",
          text: `OK pages ${last}/${total}`
        });
        send(msg);

        done && done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "failed" });
        node.error(err, msg);
        done && done(err);
      } finally {
        // Release PDF.js worker/document resources to avoid memory leaks.
        if (pdf && typeof pdf.destroy === "function") {
          try { await pdf.destroy(); } catch (_) { /* ignore */ }
        }
      }
    });
  }

  /** "" | undefined -> undefined; otherwise a positive integer or undefined. */
  function toPageNumber(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return undefined;
    }
    const n = Number(value);
    return Number.isInteger(n) ? n : undefined;
  }

  /**
   * Accepts Buffer | Uint8Array | ArrayBuffer | number[].
   * Returns a Uint8Array view over the raw PDF bytes.
   *
   * Strings are deliberately rejected: reading a PDF as text (utf8/base64)
   * yields empty or corrupt output. The message tells the user exactly how to
   * fix it (configure the preceding node to output a Buffer).
   */
  function toUint8Array(value) {
    if (value === null || value === undefined) {
      throw new Error("Input is empty; expected a PDF Buffer (msg.payload is empty).");
    }
    if (typeof value === "string") {
      throw new Error(
        "Invalid input: expected a Buffer but received a string. " +
        "A PDF must be passed as binary data. If you are reading the file with a " +
        "`file` node, set its Output to \"a single Buffer object\"; if you have a " +
        "base64 string, decode it first (e.g. Buffer.from(msg.payload, 'base64'))."
      );
    }
    if (Buffer.isBuffer(value)) return new Uint8Array(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (Array.isArray(value)) return new Uint8Array(value);
    throw new Error("Input must be a Buffer, Uint8Array or ArrayBuffer.");
  }

  RED.nodes.registerType("pdf2text", Pdf2TextNode);
};
