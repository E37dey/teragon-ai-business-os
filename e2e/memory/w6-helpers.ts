// W6-F shared e2e helpers: console-error collection (zero-error gate on every
// spec) + a minimal raw ZIP forge for the traversal-entry fixture (the
// production writer refuses hostile paths, so the attack needs a forge).
import type { Page } from "@playwright/test";

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** errors that are pure network noise (allowed ONLY in the offline test). */
export function nonNetworkErrors(errors: readonly string[]): string[] {
  return errors.filter(
    (e) =>
      !/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|Failed to load resource|net::|fetch/iu.test(
        e,
      ),
  );
}

/**
 * Open /knowledge and make sure the seeded articles actually RENDER.
 * Works around the reported seed-race defect (useInvalidateCollections
 * identity, src/app/data/hooks.ts:31): the boot seed lands in IDB but the
 * first render's query cache can stay stale. Reloading renders persisted data.
 */
export async function gotoKnowledgeSeeded(
  page: Page,
  expectVisible: (page: Page) => Promise<void>,
): Promise<void> {
  await page.goto("/knowledge");
  await expectVisible(page);
  for (let i = 0; i < 3; i += 1) {
    const seeded = await page
      .getByRole("cell", { name: /וורפינג/ })
      .first()
      .isVisible()
      .catch(() => false);
    if (seeded) return;
    await page.waitForTimeout(1_500);
    if (
      await page
        .getByRole("cell", { name: /וורפינג/ })
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    await page.reload();
    await expectVisible(page);
  }
}

// ---------------------------------------------------------------------------
// raw ZIP forge (self-contained copy of the tests/memory-import forge — e2e
// specs cannot import "@/…"-aliased app code)
// ---------------------------------------------------------------------------

const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pushU16(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff);
}
function pushU32(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

export interface ForgedEntry {
  name: string;
  content: string;
}

/** forge a store-method ZIP (valid CRCs) with attacker-controlled entry names. */
export function forgeZip(entries: readonly ForgedEntry[]): Buffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = enc.encode(e.content);
    const crc = crc32(data);

    const header: number[] = [];
    pushU32(header, 0x04034b50);
    pushU16(header, 20);
    pushU16(header, 0);
    pushU16(header, 0); // store
    pushU16(header, 0);
    pushU16(header, 0x2100);
    pushU32(header, crc);
    pushU32(header, data.length);
    pushU32(header, data.length);
    pushU16(header, nameBytes.length);
    pushU16(header, 0);
    const local = new Uint8Array(header.length + nameBytes.length + data.length);
    local.set(header, 0);
    local.set(nameBytes, header.length);
    local.set(data, header.length + nameBytes.length);
    locals.push(local);

    pushU32(central, 0x02014b50);
    pushU16(central, 20);
    pushU16(central, 20);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0x2100);
    pushU32(central, crc);
    pushU32(central, data.length);
    pushU32(central, data.length);
    pushU16(central, nameBytes.length);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, 0);
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
  return Buffer.from(out);
}
