/**
 * Build-time globals for src/sw/service-worker.js. Hand-written, and declared
 * here rather than inline: the Vite plugin in vite.config.ts substitutes the
 * first textual occurrence of the placeholder name, so writing it a second time
 * anywhere in the worker — even inside a JSDoc comment — would break dist/sw.js.
 *
 * Kept outside src/ so tsconfig.app.json and tsconfig.test.json, which include
 * src, never pick these up as app-wide globals.
 */

/** The precache list, inlined by the build as a JSON array of URLs. */
declare const __PRECACHE_MANIFEST__: string[]
