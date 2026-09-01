import { ethers } from "ethers";

/**
 * Canonicalise an arbitrary JSON-able value so two parties hashing the same
 * object get identical bytes. Sorts object keys; preserves array order;
 * emits no whitespace. Same algorithm `@0gzk/cli`'s `hashVkey` uses.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * keccak256 of the canonicalised verification key. This is what the
 * `CircuitRegistry` stores so consumers can prove the bundle they fetched
 * matches the one that was registered.
 */
export function hashVkey(vkey: unknown): `0x${string}` {
  const canonical = canonicalJSON(vkey);
  return ethers.keccak256(ethers.toUtf8Bytes(canonical)) as `0x${string}`;
}
