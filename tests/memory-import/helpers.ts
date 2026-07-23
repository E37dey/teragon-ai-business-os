// W6-B test helpers: raw ZIP builder with EVIL knobs (bad sizes, symlink
// attrs, encrypted flags, duplicate names, traversal names) + shared setup.
// The production writer (writeZip) is store-only and honest; attacks need a
// dedicated forge.
import { crc32 } from "@/memory/zip/crc32";

export interface RawZipEntrySpec {
  /** name as raw bytes OR string (string is UTF-8 encoded) */
  name: string | Uint8Array;
  data: Uint8Array;
  /** 0 = store (default), 8 = deflate-raw (data must already be compressed) */
  method?: number;
  /** declared uncompressed size (defaults to data.length for store) */
  uncompressedSize?: number;
  /** declared CRC (defaults to crc32(data) — for store entries) */
  crc?: number;
  /** general-purpose flags (bit0 = encrypted) */
  flags?: number;
  /** external attributes (upper 16 bits = unix mode; 0xA000 = symlink) */
  externalAttrs?: number;
}

function pushU16(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff);
}
function pushU32(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

/** forge a ZIP byte-for-byte with attacker-controlled metadata. */
export function forgeZip(entries: readonly RawZipEntrySpec[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = typeof e.name === "string" ? enc.encode(e.name) : e.name;
    const method = e.method ?? 0;
    const uncompressed = e.uncompressedSize ?? e.data.length;
    const crc = e.crc ?? crc32(e.data);
    const flags = e.flags ?? 0;
    const external = e.externalAttrs ?? 0;

    const header: number[] = [];
    pushU32(header, 0x04034b50);
    pushU16(header, 20);
    pushU16(header, flags);
    pushU16(header, method);
    pushU16(header, 0); // time
    pushU16(header, 0x2100); // date (1996-08-01ish, valid)
    pushU32(header, crc);
    pushU32(header, e.data.length);
    pushU32(header, uncompressed);
    pushU16(header, nameBytes.length);
    pushU16(header, 0);
    const local = new Uint8Array(header.length + nameBytes.length + e.data.length);
    local.set(header, 0);
    local.set(nameBytes, header.length);
    local.set(e.data, header.length + nameBytes.length);
    locals.push(local);

    pushU32(central, 0x02014b50);
    pushU16(central, 20);
    pushU16(central, 20);
    pushU16(central, flags);
    pushU16(central, method);
    pushU16(central, 0);
    pushU16(central, 0x2100);
    pushU32(central, crc);
    pushU32(central, e.data.length);
    pushU32(central, uncompressed);
    pushU16(central, nameBytes.length);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, external);
    pushU32(central, offset);
    for (const b of nameBytes) central.push(b);

    offset += local.length;
  }

  const eocd: number[] = [];
  pushU32(eocd, 0x06054b50);
  pushU16(eocd, 0);
  pushU16(eocd, 0);
  pushU16(eocd, entries.length);
  pushU16(eocd, entries.length);
  pushU32(eocd, central.length);
  pushU32(eocd, offset);
  pushU16(eocd, 0);

  const out = new Uint8Array(offset + central.length + eocd.length);
  let o = 0;
  for (const l of locals) {
    out.set(l, o);
    o += l.length;
  }
  out.set(central, o);
  o += central.length;
  out.set(eocd, o);
  return out;
}

/** compress bytes with the platform deflate-raw (for method-8 test entries). */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  void writer.write(data as never).then(() => writer.close());
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const c = value as Uint8Array;
    chunks.push(c);
    total += c.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function md(name: string, content: string): { name: string; bytes: Uint8Array } {
  return { name, bytes: enc.encode(content) };
}
