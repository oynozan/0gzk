/**
 * Minimal `.r1cs` header reader. Parses only the binary header section —
 * never the (potentially huge) constraint payload — by seeking through the
 * section table with positioned reads on an open file descriptor.
 *
 * Binary layout (iden3 r1cs format, https://github.com/iden3/r1csfile):
 *   magic "r1cs" (0x72 0x31 0x63 0x73)
 *   u32 LE version
 *   u32 LE nSections
 *   sections: [u32 LE type, u64 LE size, payload(size bytes)]
 *
 * Header section (type 1) payload:
 *   u32 LE fieldSize (n)
 *   n bytes  prime
 *   u32 LE nWires
 *   u32 LE nPubOut
 *   u32 LE nPubIn
 *   u32 LE nPrvIn
 *   u64 LE nLabels
 *   u32 LE mConstraints
 */
import { open, type FileHandle } from "node:fs/promises";

export interface R1csCounts {
  mConstraints: number;
  nPubOut: number;
  nPubIn: number;
  nPrvIn: number;
}

const MAGIC = "r1cs";
const HEADER_SECTION_TYPE = 1;

async function readExact(handle: FileHandle, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error(`truncated r1cs file: wanted ${length} bytes at offset ${position}, got ${bytesRead}`);
  }
  return buffer;
}

function toSafeNumber(value: bigint, what: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`r1cs ${what} out of safe integer range: ${value}`);
  }
  return Number(value);
}

/** Read the constraint/IO counts from an `.r1cs` file without loading it. */
export async function readR1csCounts(path: string): Promise<R1csCounts> {
  const handle = await open(path, "r");
  try {
    const preamble = await readExact(handle, 12, 0);
    if (preamble.toString("latin1", 0, 4) !== MAGIC) {
      throw new Error(`${path} is not an r1cs file (bad magic)`);
    }
    const nSections = preamble.readUInt32LE(8);
    let position = 12;
    for (let i = 0; i < nSections; i++) {
      const sectionHeader = await readExact(handle, 12, position);
      const type = sectionHeader.readUInt32LE(0);
      const size = toSafeNumber(sectionHeader.readBigUInt64LE(4), "section size");
      position += 12;
      if (type === HEADER_SECTION_TYPE) {
        const fieldSize = (await readExact(handle, 4, position)).readUInt32LE(0);
        // fieldSize(4) + prime(fieldSize) already consumed conceptually; the
        // remaining fixed-size tail is nWires..mConstraints = 4*4 + 8 + 4.
        const tail = await readExact(handle, 28, position + 4 + fieldSize);
        return {
          nPubOut: tail.readUInt32LE(4),
          nPubIn: tail.readUInt32LE(8),
          nPrvIn: tail.readUInt32LE(12),
          mConstraints: tail.readUInt32LE(24),
        };
      }
      position += size;
    }
    throw new Error(`${path} has no header section (type 1)`);
  } finally {
    await handle.close();
  }
}
