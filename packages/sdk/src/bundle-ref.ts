/**
 * Bundle-reference codec: maps between the registry's `bytes32 rootHash` and
 * storage-backend addresses. Isomorphic, dependency-free.
 *
 * Conventions (also carried on-chain in `Version.metadataURI`):
 * - `0g://0x<rootHash>`  — bundle tarball on 0G Storage, rootHash = 0G merkle root.
 * - `ipfs://Qm...`       — bundle tarball on IPFS, pinned as CIDv0 (sha2-256).
 *   CIDv0 is `base58btc(0x12 0x20 ‖ digest)`, bijective with a 32-byte digest,
 *   so `rootHash = 0x<digest>` satisfies the registry's nonzero-bytes32 slot
 *   and the CID is reconstructible from the bare rootHash.
 * - Anything else in `metadataURI` (empty string, https:// docs link, …) means
 *   legacy behavior: fetch from 0G Storage by `rootHash`.
 */

export type StorageBackendId = "0g" | "ipfs";

export interface BundleRef {
  backend: StorageBackendId;
  /** Backend-native address: `0x<rootHash>` for 0g, `Qm...` CID for ipfs. */
  ref: string;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((c, i) => [c, BigInt(i)]));
const CIDV0_PREFIX = new Uint8Array([0x12, 0x20]); // sha2-256 multihash, 32-byte digest

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = BASE58_ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const v = BASE58_INDEX.get(c);
    if (v === undefined) throw new Error(`Invalid base58 character "${c}"`);
    n = n * 58n + v;
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

const ROOT_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function isRootHash(value: string): boolean {
  return ROOT_HASH_RE.test(value);
}

/** `Qm...` CIDv0 → `0x<32-byte digest>`. Throws on CIDv1 or non-sha256 CIDs. */
export function cidToRootHash(cid: string): string {
  if (!cid.startsWith("Qm")) {
    throw new Error(
      `Unsupported CID "${cid}": only CIDv0 (sha2-256, "Qm...") is supported. ` +
        "Pin with cidVersion 0.",
    );
  }
  const bytes = base58Decode(cid);
  if (bytes.length !== 34 || bytes[0] !== CIDV0_PREFIX[0] || bytes[1] !== CIDV0_PREFIX[1]) {
    throw new Error(`Invalid CIDv0 "${cid}": expected a 32-byte sha2-256 multihash.`);
  }
  return "0x" + [...bytes.slice(2)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `0x<32-byte digest>` → `Qm...` CIDv0. */
export function rootHashToCidV0(rootHash: string): string {
  if (!isRootHash(rootHash)) {
    throw new Error(`Invalid rootHash "${rootHash}": expected 0x + 64 hex chars.`);
  }
  const digest = rootHash.slice(2).toLowerCase();
  const bytes = new Uint8Array(34);
  bytes.set(CIDV0_PREFIX);
  for (let i = 0; i < 32; i++) {
    bytes[2 + i] = parseInt(digest.slice(i * 2, i * 2 + 2), 16);
  }
  return base58Encode(bytes);
}

export function formatBundleUri(backend: StorageBackendId, rootHash: string): string {
  if (backend === "ipfs") return `ipfs://${rootHashToCidV0(rootHash)}`;
  return `0g://${rootHash.toLowerCase()}`;
}

/**
 * THE resolution rule for fetch-by-name. Given a registry record, decide which
 * storage backend holds the bundle and under what address:
 *
 * 1. `metadataURI` starts with `ipfs://` → ipfs; the CID's digest must equal
 *    `rootHash` (an inconsistent record is an error, not a fallback).
 * 2. `metadataURI` starts with `0g://` → 0g; embedded hash must equal `rootHash`.
 * 3. Anything else → 0g by bare `rootHash` (today's behavior).
 */
export function parseBundleRef(record: { rootHash: string; metadataURI: string }): BundleRef {
  const uri = record.metadataURI ?? "";
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice("ipfs://".length);
    const digest = cidToRootHash(cid);
    if (digest.toLowerCase() !== record.rootHash.toLowerCase()) {
      throw new Error(
        `Registry record is inconsistent: metadataURI CID ${cid} hashes to ${digest}, ` +
          `but rootHash is ${record.rootHash}.`,
      );
    }
    return { backend: "ipfs", ref: cid };
  }
  if (uri.startsWith("0g://")) {
    const embedded = uri.slice("0g://".length);
    if (embedded.toLowerCase() !== record.rootHash.toLowerCase()) {
      throw new Error(
        `Registry record is inconsistent: metadataURI ${uri} does not match ` +
          `rootHash ${record.rootHash}.`,
      );
    }
    return { backend: "0g", ref: record.rootHash };
  }
  return { backend: "0g", ref: record.rootHash };
}

/**
 * Classify a user-supplied bundle reference string. Bare `0x` root hashes are
 * ambiguous (either backend could hold them) — returns undefined so the caller
 * falls back to its configured default backend.
 */
export function backendForRef(ref: string): StorageBackendId | undefined {
  if (ref.startsWith("ipfs://") || ref.startsWith("Qm")) return "ipfs";
  if (ref.startsWith("0g://")) return "0g";
  return undefined;
}
