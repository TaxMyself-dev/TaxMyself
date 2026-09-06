/// <reference lib="webworker" />

/**
 * Thin wrapper so the build emits pdf.js's worker as a hashed application chunk
 * (`new Worker(new URL('./pdfjs.worker', import.meta.url), { type: 'module' })`
 * in pdf-preview-dialog.component.ts). Importing the package path directly from
 * the component is NOT bundled — webpack only rewrites relative URLs — which
 * would leave a 404 at runtime.
 *
 * The module registers pdf.js's message handler on load; it has no exports.
 */
import 'pdfjs-dist/build/pdf.worker.min.mjs';
