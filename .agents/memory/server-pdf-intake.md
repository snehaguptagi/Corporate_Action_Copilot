---
name: Server-side PDF intake
description: Runtime compatibility rule for extracting text and page images from corporate-action PDFs.
---

Use the system `pdftotext` utility for native text-layer extraction and `pdftoppm` to render image-only PDFs for vision OCR. Do not import `pdf-parse` into the API server runtime.

**Why:** In this Replit Node runtime, the parser imported PDF.js canvas code at server startup and crashed because `DOMMatrix` and its native canvas dependency were unavailable. Command-line PDF utilities avoid loading browser-canvas code and support the same evidence-first extraction flow.

**How to apply:** Keep PDF parsing behind temporary-file processing in the server. Treat a short or empty text layer as a scanned PDF and render only the needed early pages for vision extraction.