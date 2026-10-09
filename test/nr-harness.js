"use strict";

/**
 * Minimal Node-RED runtime stub that loads the node module the same way
 * Node-RED does, then drives it with a real PDF buffer to validate behaviour.
 * Usage: node test/nr-harness.js [path-to.pdf]
 */

const path = require("node:path");
const fs = require("node:fs");

const NODE_MODULE = path.resolve(__dirname, "..", "nodes", "pdf2text.js");
const PDF_PATH = process.argv[2] || "D:/Work/test/Vector fiscal.pdf";

// ---- Minimal RED stub -------------------------------------------------------
const registered = [];
const logs = [];

const RED = {
  nodes: {
    createNode(node, config) {
      node.name = config.name;
      node.log = (m) => logs.push(["log", m]);
      node.warn = (m) => logs.push(["warn", m]);
      node.error = (err, msg) => logs.push(["error", err && err.message]);
      node.status = (s) => logs.push(["status", s]);
      node.send = null; // set per test
    },
    registerType(type, ctor) {
      registered.push({ type, ctor });
    }
  },
  util: {
    cloneMessage: (m) => JSON.parse(JSON.stringify(m, (k, v) => v)),
    getMessageProperty: (msg, prop) => {
      if (!prop) return undefined;
      return prop.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), msg);
    },
    setMessageProperty: (msg, prop, value) => {
      const keys = prop.split(".");
      const last = keys.pop();
      const target = keys.reduce((o, k) => (o[k] = o[k] || {}), msg);
      target[last] = value;
      return msg;
    }
  }
};

// Load the node exactly like Node-RED (require the .js, call it with RED)
require(NODE_MODULE)(RED);

if (registered.length !== 1) {
  console.error("FAIL: expected 1 registered type, got", registered.length);
  process.exit(1);
}
if (registered[0].type !== "pdf2text") {
  console.error("FAIL: wrong node type:", registered[0].type);
  process.exit(1);
}
console.log("OK  node type registered:", registered[0].type);

// ---- Build a node instance --------------------------------------------------
function makeNode(config, sendCollector) {
  const node = { on: (ev, fn) => (node._handler = fn) };
  registered[0].ctor.call(node, Object.assign({ name: "t" }, config));
  node.send = (out) => sendCollector.push(out);
  return node;
}

// ---- Test 1: merged output --------------------------------------------------
function testMerged() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PDF_PATH)) {
      console.warn("! PDF not found, skipping:", PDF_PATH);
      return resolve();
    }
    const sent = [];
    const node = makeNode({}, sent);
    const msg = { payload: fs.readFileSync(PDF_PATH), _msgid: "t1" };
    const done = (err) => (err ? reject(err) : resolve({ node, sent, msg }));
    node._handler(msg, (o) => sent.push(o), done);
  });
}

// ---- Test 2: page range -----------------------------------------------------
function testRange(first, last) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PDF_PATH)) return resolve();
    const sent = [];
    const node = makeNode({ firstPage: first, lastPage: last }, sent);
    const msg = { payload: fs.readFileSync(PDF_PATH), _msgid: "t2" };
    const done = (err) => (err ? reject(err) : resolve(sent[0]));
    node._handler(msg, (o) => sent.push(o), done);
  });
}

// ---- Test 3: invalid input --------------------------------------------------
function testInvalid(value, label) {
  return new Promise((resolve, reject) => {
    const sent = [];
    const node = makeNode({}, sent);
    const msg = { payload: value, _msgid: "t3" };
    node._handler(msg, (o) => sent.push(o), (err) => {
      if (!err) return reject(new Error(`expected an error for ${label}`));
      resolve(err.message);
    });
  });
}

// ---- Test 4: prototype pollution guard -------------------------------------
function testProtoPollution() {
  try {
    const sent = [];
    makeNode({ outputProp: "__proto__.polluted" }, sent);
    throw new Error("constructor accepted a forbidden property path");
  } catch (err) {
    if (!/reserved key/i.test(err.message)) throw err;
    if ({}.polluted !== undefined) throw new Error("prototype was polluted");
    return err.message;
  }
}

(async () => {
  const merged = await testMerged();
  const mergedRef = merged ? merged.sent : [];
  if (merged) {
    const msg = merged.sent[0];
    if (typeof msg.payload !== "string") throw new Error("merged payload is not a string");
    if (!msg.pdf2text || typeof msg.pdf2text.totalPages !== "number") {
      throw new Error("metadata missing");
    }
    if (msg.pdf2text.success !== true) throw new Error("success flag missing");
    console.log(`OK  merged: ${msg.pdf2text.totalPages} pages, ${msg.payload.length} chars`);
    console.log("    text starts:", JSON.stringify(msg.payload.slice(0, 60)));
  }

  const ranged = await testRange(1, 1);
  if (ranged) {
    if (typeof ranged.payload !== "string") throw new Error("range payload is not a string");
    if (ranged.pdf2text.fromPage !== 1 || ranged.pdf2text.toPage !== 1) {
      throw new Error("range metadata not honoured: " + JSON.stringify(ranged.pdf2text));
    }
    if (ranged.pdf2text.pages !== 1) throw new Error("expected 1 extracted page");
    const merged = mergedRef[0];
    if (merged && ranged.payload.length >= merged.payload.length) {
      throw new Error("range 1..1 should be shorter than the whole document");
    }
    console.log(`OK  range 1..1: ${ranged.payload.length} chars`);
  }

  const invalidMsg = await testInvalid(12345, "non-PDF payload");
  console.log("OK  invalid payload rejected:", invalidMsg);

  const textMsg = await testInvalid("hello world, not a pdf", "plain text payload");
  console.log("OK  plain text rejected:", textMsg.slice(0, 60) + "...");

  const protoMsg = testProtoPollution();
  console.log("OK  prototype pollution blocked:", protoMsg);

  console.log("\nALL TESTS PASSED");
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
