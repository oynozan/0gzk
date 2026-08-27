// Minimal POSIX TAR reader sufficient for 0gzk bundles. A 0gzk bundle
// is exactly four regular files (metadata.json, circuit.wasm,
// circuit_final.zkey, verification_key.json, plus an optional verifier.sol),
// packed with no long-name extensions, so we don't need to handle USTAR
// PAX/GNU exotica.

export interface TarEntry {
  name: string;
  bytes: Uint8Array;
}

function readString(buf: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(offset, end));
}

function readOctal(buf: Uint8Array, offset: number, length: number): number {
  const s = readString(buf, offset, length).trim();
  return s.length ? parseInt(s, 8) : 0;
}

export function parseTar(data: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= data.length) {
    // End-of-archive sentinel: two consecutive 512-byte zero blocks. We bail
    // on a single zero block to be lenient — well-formed archives won't have
    // a zero block before the trailer.
    if (data[offset] === 0) break;

    const name = readString(data, offset, 100);
    const size = readOctal(data, offset + 124, 12);
    const typeflag = String.fromCharCode(data[offset + 156] || 0);

    offset += 512;

    if (typeflag === "0" || typeflag === "\0" || typeflag === "") {
      entries.push({
        name,
        bytes: data.subarray(offset, offset + size),
      });
    }

    // Files are padded to the next 512-byte boundary.
    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}
