// TERAGON AI BUSINESS OS — CRC-32 (IEEE 802.3), table-based, for the minimal
// ZIP engine (Wave 6, W6-B). Pure, dependency-free.

let TABLE: Uint32Array | null = null;

function table(): Uint32Array {
  if (TABLE) return TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  TABLE = t;
  return t;
}

export function crc32(bytes: Uint8Array): number {
  const t = table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ (t[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
