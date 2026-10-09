# node-red-contrib-pdf2text

A Node-RED node that extracts the text of a PDF using
[unpdf](https://github.com/unjs/unpdf) (PDF.js under the hood, no native
dependency).

## Features

- Extract text from a PDF supplied as a `Buffer`, `Uint8Array` or `ArrayBuffer`.
- Limit the extraction to a page range (**First page** / **Last page**).
- Result metadata available on `msg.pdf2text`.
- Explicit, actionable errors for invalid input (never a silent empty output).
- Pure JavaScript — works on Windows, Linux and macOS with no build step.

## Requirements

- Node.js **18 or newer**
- Node-RED **3.0 or newer**

## Installation

From the Node-RED editor: **Manage palette → Install → search `pdf2text`**.

Or from the command line, inside your Node-RED user directory (usually
`~/.node-red`):

```bash
cd ~/.node-red
npm install node-red-contrib-pdf2text
```

## Node: `pdf2text`

Category: **parser**

### Input

| Property  | Type                                     | Description |
|-----------|------------------------------------------|-------------|
| `payload` | `Buffer` / `Uint8Array` / `ArrayBuffer`  | The PDF as **binary data**. Configurable via **PDF property**. |

> A **string is not accepted.** Reading a PDF as text (utf8 or base64) produces
> empty or corrupt output, so the node raises an explicit error telling you how
> to fix it. Configure the upstream node so it outputs binary data — for a
> `file` node set **Output** to **"a single Buffer object"**. If you only have a
> base64 string, decode it first, e.g. with a `function` node:
> `msg.payload = Buffer.from(msg.payload, "base64"); return msg;`.

### Output

| Property   | Type     | Description |
|------------|----------|-------------|
| `payload`  | `string` | The extracted text. Configurable via **Output property**. |
| `pdf2text` | `object` | Result metadata (fixed property, see below). |

`msg.pdf2text` contains:

| Field        | Type      | Description |
|--------------|-----------|-------------|
| `success`    | `boolean` | `true` when extraction succeeded. |
| `totalPages` | `number`  | Total pages in the document. |
| `pages`      | `number`  | Number of pages actually extracted (the requested range). |
| `fromPage`   | `number`  | First extracted page (1-based). |
| `toPage`     | `number`  | Last extracted page (1-based). |
| `elapsedMs`  | `number`  | Processing time in milliseconds. |

### Options

| Field | Description |
|-------|-------------|
| **PDF property** | Message property holding the PDF. Default `msg.payload`. Uses the standard Node-RED property picker. |
| **Output property** | Message property where the text is written. Default `msg.payload`. |
| **First page** | First page to extract (1-based, inclusive). Empty = from page 1. |
| **Last page** | Last page to extract (1-based, inclusive). Empty = to the last page. |

The text of the selected pages is joined into a single string with a blank line
between pages (`\n\n`).

### Status

The node reports its result in the workspace:

- `extracting...` (blue) — processing.
- `OK pages <last>/<total>` (green) — success, e.g. `OK pages 3/3`.
- `invalid input` / `failed` (red) — an error was raised.

### Errors

The node raises an error (and emits no message) when:

- The input is empty, or is not a `Buffer`/`Uint8Array`/`ArrayBuffer` (e.g. a string).
- The PDF cannot be parsed (corrupt, or not actually a PDF).
- **First page** is beyond the document, or **First page > Last page**.

A **Last page** beyond the document is clamped to the last page (a warning is logged).

## Example flow

Import [`examples/extract-pdf-text.json`](examples/extract-pdf-text.json) via
**Menu → Import**. It reads a PDF from disk into a Buffer and extracts the text.

> Prefer a `file` node with **Output: a single Buffer object** over a `function`
> node — it avoids loading the whole file with `fs.readFileSync`.

## Security notes

- **Input validation:** only binary input is accepted; strings are rejected.
- **Prototype pollution:** configured property paths are validated and reserved
  keys (`__proto__`, `prototype`, `constructor`) are refused.
- **Resource handling:** the PDF.js document is destroyed after each message to
  avoid memory leaks on large documents.

A PDF is untrusted input. PDF.js is generally robust, but a malformed PDF can
consume CPU/memory; process untrusted files on a worker/service you can restart,
and consider a file-size limit upstream.

## Development

```bash
npm install
npm test                                          # smoke test + Node-RED harness
node test/nr-harness.js "C:/path/to/file.pdf"     # harness against a real PDF
```

To develop against a local Node-RED, install the folder into your user directory:

```bash
cd ~/.node-red
npm install "C:/path/to/node-red-contrib-pdf2text"
```

## Contributing

Issues and pull requests are welcome. Please run `npm test` before opening a PR.

## License

[MIT](LICENSE)
