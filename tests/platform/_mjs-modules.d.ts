// Gate S7.0 — the platform pipeline is authored as plain ESM .mjs (per the repo
// contract: scripts are JavaScript, not TypeScript). These deterministic unit
// tests import those modules for their pure, adapter-injected logic. src/ and
// netlify/ import NO .mjs, so this ambient declaration is scoped in practice to
// the platform tests and does not weaken app typechecking.
declare module "*.mjs";
