// TERAGON AI BUSINESS OS — minimal ZIP reader/writer (Wave 6, W6-B).
//
// NO npm dependency (jszip et al. were NOT added — see
// docs/integration-requests-w6b.md). Implemented directly over Uint8Array:
// - reader: central-directory walk (EOCD scan), store (method 0) sliced
//   directly, deflate (method 8) inflated via the platform's
//   DecompressionStream("deflate-raw") with a STREAMING output cap
// - writer: store-only (method 0) — honest, deterministic bytes (given a
//   fixed date), CRC-32 computed locally
//
// Security checks run on DECLARED central-directory metadata BEFORE any
// inflation: entry count, total/entry size, compression ratio (zip-bomb),
// path traversal (../, absolute, drive letters, backslash tricks), dir depth,
// symlink entries, nested archives, executable extensions, duplicate names,
// encrypted entries. Malformed UTF-8 names decode with safe replacement and
// are flagged. Every rejection is a typed Hebrew MemoryImportError.
import {
  IMPORT_MAX_COMPRESSION_RATIO,
  IMPORT_MAX_DIR_DEPTH,
  IMPORT_MAX_FILES,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_TOTAL_BYTES,
  MemoryImportError,
  isExecutableFileName,
  isNestedArchiveFileName,
} from "@/memory/import/limits";
import { crc32 } from "./crc32";

// ---------------------------------------------------------------------------
// shared types
// ---------------------------------------------------------------------------

export interface ZipEntry {
  /** normalized path inside the archive (forward slashes) */
  path: string;
  /** decompressed content */
  bytes: Uint8Array;
  /** true when the entry name contained malformed UTF-8 (replaced safely) */
  malformedName: boolean;
  /** compression method used in the archive (0=store, 8=deflate) */
  method: number;
}

export interface ZipReadResult {
  entries: ZipEntry[];
  /** directory entries seen (skipped) */
  directoryCount: number;
}

export interface ZipSecurityLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  maxCompressionRatio: number;
  maxDirDepth: number;
}

export const DEFAULT_ZIP_LIMITS: ZipSecurityLimits = {
  maxFiles: IMPORT_MAX_FILES,
  maxTotalBytes: IMPORT_MAX_TOTAL_BYTES,
  maxFileBytes: IMPORT_MAX_FILE_BYTES,
  maxCompressionRatio: IMPORT_MAX_COMPRESSION_RATIO,
  maxDirDepth: IMPORT_MAX_DIR_DEPTH,
};

// ---------------------------------------------------------------------------
// little-endian helpers
// ---------------------------------------------------------------------------

function u16(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}
function u32(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;
}

// ---------------------------------------------------------------------------
// path security
// ---------------------------------------------------------------------------

/** normalize an archive path: backslashes → slashes (backslash tricks die here). */
export function normalizeZipPath(name: string): string {
  return name.replace(/\\/gu, "/");
}

/**
 * Validate one entry path. Throws MemoryImportError on traversal / absolute
 * path / drive letter / depth overflow. Returns the normalized path.
 */
export function assertSafeZipPath(rawName: string, maxDepth = IMPORT_MAX_DIR_DEPTH): string {
  const name = normalizeZipPath(rawName);
  if (
    name.startsWith("/") ||
    /^[a-zA-Z]:/u.test(name) || // drive letter (C:\ or C:/)
    name.startsWith("//") ||
    name.split("/").includes("..")
  ) {
    throw new MemoryImportError("ZIP_PATH_TRAVERSAL", rawName);
  }
  const depth = name.split("/").filter((p) => p !== "" && p !== ".").length;
  if (depth > maxDepth) {
    throw new MemoryImportError("DIR_DEPTH_EXCEEDED", rawName);
  }
  return name;
}

// ---------------------------------------------------------------------------
// reader
// ---------------------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

interface CentralEntry {
  rawName: string;
  name: string;
  malformedName: boolean;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  externalAttrs: number;
  isDirectory: boolean;
}

function decodeName(bytes: Uint8Array): { name: string; malformed: boolean } {
  const name = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return { name, malformed: name.includes("�") };
}

function findEocd(bytes: Uint8Array): number {
  // EOCD is at the end; comment can be up to 64KB
  const min = Math.max(0, bytes.length - (22 + 0xffff));
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(bytes, i) === EOCD_SIG) return i;
  }
  throw new MemoryImportError("ZIP_MALFORMED");
}

function readCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  const eocd = findEocd(bytes);
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  const entries: CentralEntry[] = [];
  let o = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (o + 46 > bytes.length || u32(bytes, o) !== CDIR_SIG) {
      throw new MemoryImportError("ZIP_MALFORMED");
    }
    const flags = u16(bytes, o + 8);
    const method = u16(bytes, o + 10);
    const crc = u32(bytes, o + 16);
    const compressedSize = u32(bytes, o + 20);
    const uncompressedSize = u32(bytes, o + 24);
    const nameLen = u16(bytes, o + 28);
    const extraLen = u16(bytes, o + 30);
    const commentLen = u16(bytes, o + 32);
    const externalAttrs = u32(bytes, o + 38);
    const localOffset = u32(bytes, o + 42);
    const { name: rawName, malformed } = decodeName(bytes.slice(o + 46, o + 46 + nameLen));
    entries.push({
      rawName,
      name: normalizeZipPath(rawName),
      malformedName: malformed,
      method,
      flags,
      crc,
      compressedSize,
      uncompressedSize,
      localOffset,
      externalAttrs,
      isDirectory: rawName.endsWith("/") || rawName.endsWith("\\"),
    });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** security screening over DECLARED metadata — runs BEFORE any inflation. */
function screenEntries(entries: CentralEntry[], limits: ZipSecurityLimits): void {
  const files = entries.filter((e) => !e.isDirectory);
  if (files.length > limits.maxFiles) throw new MemoryImportError("TOO_MANY_FILES");

  let totalDeclared = 0;
  const seen = new Set<string>();
  for (const e of files) {
    if ((e.flags & 0x1) !== 0) throw new MemoryImportError("ZIP_ENCRYPTED", e.name);
    // symlink: unix mode in the upper 16 bits of external attrs
    if (((e.externalAttrs >>> 16) & 0xf000) === 0xa000) {
      throw new MemoryImportError("ZIP_SYMLINK", e.name);
    }
    assertSafeZipPath(e.rawName, limits.maxDirDepth);
    if (isNestedArchiveFileName(e.name)) throw new MemoryImportError("ZIP_NESTED_ARCHIVE", e.name);
    if (isExecutableFileName(e.name)) throw new MemoryImportError("ZIP_EXECUTABLE", e.name);
    const key = e.name.toLowerCase();
    if (seen.has(key)) throw new MemoryImportError("ZIP_DUPLICATE_NAME", e.name);
    seen.add(key);
    if (e.uncompressedSize > limits.maxFileBytes) throw new MemoryImportError("FILE_TOO_LARGE", e.name);
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > limits.maxCompressionRatio) {
      throw new MemoryImportError("COMPRESSION_RATIO_EXCEEDED", e.name);
    }
    totalDeclared += e.uncompressedSize;
  }
  if (totalDeclared > limits.maxTotalBytes) throw new MemoryImportError("TOTAL_TOO_LARGE");
}

function compressedSlice(bytes: Uint8Array, e: CentralEntry): Uint8Array {
  const o = e.localOffset;
  if (o + 30 > bytes.length || u32(bytes, o) !== LOCAL_SIG) {
    throw new MemoryImportError("ZIP_MALFORMED", e.name);
  }
  const nameLen = u16(bytes, o + 26);
  const extraLen = u16(bytes, o + 28);
  const start = o + 30 + nameLen + extraLen;
  const end = start + e.compressedSize;
  if (end > bytes.length) throw new MemoryImportError("ZIP_MALFORMED", e.name);
  return bytes.slice(start, end);
}

/** inflate raw-deflate data with a hard streaming cap on OUTPUT bytes. */
async function inflateRaw(data: Uint8Array, maxOut: number, path: string): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new MemoryImportError("ZIP_INFLATE_UNAVAILABLE", path);
  }
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  let writeFailed = false;
  const done = writer
    .write(data as never)
    .then(() => writer.close())
    .catch(() => {
      writeFailed = true;
    });
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let out = 0;
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = (await reader.read()) as ReadableStreamReadResult<Uint8Array>;
    } catch {
      throw new MemoryImportError("ZIP_MALFORMED", path);
    }
    if (step.done) break;
    const chunk = step.value;
    out += chunk.length;
    if (out > maxOut) {
      // declared size lied — abort mid-stream (zip-bomb runtime guard)
      await reader.cancel().catch(() => undefined);
      throw new MemoryImportError("COMPRESSION_RATIO_EXCEEDED", path);
    }
    chunks.push(chunk);
  }
  await done;
  if (writeFailed) throw new MemoryImportError("ZIP_MALFORMED", path);
  const result = new Uint8Array(out);
  let o = 0;
  for (const c of chunks) {
    result.set(c, o);
    o += c.length;
  }
  return result;
}

/**
 * Read a ZIP archive with full security screening. Directories are skipped
 * (counted); file entries are screened, then decompressed with CRC verify.
 */
export async function readZip(
  bytes: Uint8Array,
  limits: ZipSecurityLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipReadResult> {
  const central = readCentralDirectory(bytes);
  screenEntries(central, limits);
  const entries: ZipEntry[] = [];
  let directoryCount = 0;
  for (const e of central) {
    if (e.isDirectory) {
      directoryCount += 1;
      continue;
    }
    const raw = compressedSlice(bytes, e);
    let content: Uint8Array;
    if (e.method === 0) {
      content = raw;
    } else if (e.method === 8) {
      // cap = declared size (already ratio-screened); never inflate past it
      content = await inflateRaw(raw, Math.min(e.uncompressedSize, limits.maxFileBytes), e.name);
    } else {
      throw new MemoryImportError("ZIP_MALFORMED", e.name);
    }
    if (content.length !== e.uncompressedSize || crc32(content) !== e.crc) {
      throw new MemoryImportError("ZIP_CRC_MISMATCH", e.name);
    }
    entries.push({ path: e.name, bytes: content, malformedName: e.malformedName, method: e.method });
  }
  return { entries, directoryCount };
}

// ---------------------------------------------------------------------------
// writer (store-only — honest, no fake compression)
// ---------------------------------------------------------------------------

export interface ZipWriteEntry {
  path: string;
  bytes: Uint8Array;
}

function dosDateTime(iso: string): { date: number; time: number } {
  const d = new Date(iso);
  const year = Math.max(1980, d.getUTCFullYear());
  const date = ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  return { date, time };
}

function pushU16(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff);
}
function pushU32(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

/**
 * Write a ZIP (method 0 = store, UTF-8 names). Deterministic for a fixed
 * `generatedAtISO` — export checksums are stable and testable.
 */
export function writeZip(entries: readonly ZipWriteEntry[], generatedAtISO: string): Uint8Array {
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(generatedAtISO);
  const localParts: Uint8Array[] = [];
  const centralParts: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(normalizeZipPath(entry.path));
    const crc = crc32(entry.bytes);
    const header: number[] = [];
    pushU32(header, LOCAL_SIG);
    pushU16(header, 20); // version needed
    pushU16(header, 0x0800); // flags: UTF-8 names
    pushU16(header, 0); // method: store
    pushU16(header, time);
    pushU16(header, date);
    pushU32(header, crc);
    pushU32(header, entry.bytes.length); // compressed (= stored)
    pushU32(header, entry.bytes.length); // uncompressed
    pushU16(header, nameBytes.length);
    pushU16(header, 0); // extra len
    const local = new Uint8Array(header.length + nameBytes.length + entry.bytes.length);
    local.set(header, 0);
    local.set(nameBytes, header.length);
    local.set(entry.bytes, header.length + nameBytes.length);
    localParts.push(local);

    pushU32(centralParts, CDIR_SIG);
    pushU16(centralParts, 20); // version made by
    pushU16(centralParts, 20); // version needed
    pushU16(centralParts, 0x0800);
    pushU16(centralParts, 0); // method
    pushU16(centralParts, time);
    pushU16(centralParts, date);
    pushU32(centralParts, crc);
    pushU32(centralParts, entry.bytes.length);
    pushU32(centralParts, entry.bytes.length);
    pushU16(centralParts, nameBytes.length);
    pushU16(centralParts, 0); // extra
    pushU16(centralParts, 0); // comment
    pushU16(centralParts, 0); // disk
    pushU16(centralParts, 0); // internal attrs
    pushU32(centralParts, 0); // external attrs
    pushU32(centralParts, offset);
    for (const b of nameBytes) centralParts.push(b);

    offset += local.length;
  }

  const eocd: number[] = [];
  const centralSize = centralParts.length;
  pushU32(eocd, EOCD_SIG);
  pushU16(eocd, 0); // disk
  pushU16(eocd, 0); // cd start disk
  pushU16(eocd, entries.length);
  pushU16(eocd, entries.length);
  pushU32(eocd, centralSize);
  pushU32(eocd, offset);
  pushU16(eocd, 0); // comment len

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of localParts) {
    out.set(part, o);
    o += part.length;
  }
  out.set(centralParts, o);
  o += centralSize;
  out.set(eocd, o);
  return out;
}
