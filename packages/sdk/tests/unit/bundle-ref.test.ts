import { describe, expect, it } from "vitest";

import {
  backendForRef,
  cidToRootHash,
  formatBundleUri,
  isRootHash,
  parseBundleRef,
  rootHashToCidV0,
} from "../../src/bundle-ref.js";

// Independently computed vector: sha2-256 of the empty string, encoded as a
// CIDv0 (0x12 0x20 ‖ digest, base58btc). Verified against a Python
// implementation and the well-known empty-file multihash.
const DIGEST = "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const CID = "QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n";

describe("bundle-ref codec", () => {
  it("cidToRootHash matches the known vector", () => {
    expect(cidToRootHash(CID)).toBe(DIGEST);
  });

  it("rootHashToCidV0 matches the known vector", () => {
    expect(rootHashToCidV0(DIGEST)).toBe(CID);
    expect(rootHashToCidV0(DIGEST.toUpperCase().replace("0X", "0x"))).toBe(CID);
  });

  it("round-trips arbitrary digests", () => {
    const digest = "0x" + "00ff".repeat(16);
    expect(cidToRootHash(rootHashToCidV0(digest))).toBe(digest);
  });

  it("rejects CIDv1 and malformed input", () => {
    expect(() => cidToRootHash("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toThrow(
      /CIDv0/,
    );
    expect(() => cidToRootHash("Qm0O")).toThrow(/base58|CIDv0/);
    expect(() => rootHashToCidV0("0x1234")).toThrow(/rootHash/);
  });

  it("isRootHash", () => {
    expect(isRootHash(DIGEST)).toBe(true);
    expect(isRootHash(CID)).toBe(false);
    expect(isRootHash("0x123")).toBe(false);
  });

  it("formatBundleUri", () => {
    expect(formatBundleUri("ipfs", DIGEST)).toBe(`ipfs://${CID}`);
    expect(formatBundleUri("0g", DIGEST)).toBe(`0g://${DIGEST}`);
  });

  describe("parseBundleRef", () => {
    it("ipfs:// metadataURI with matching digest", () => {
      expect(parseBundleRef({ rootHash: DIGEST, metadataURI: `ipfs://${CID}` })).toEqual({
        backend: "ipfs",
        ref: CID,
      });
    });

    it("ipfs:// metadataURI with mismatched digest throws", () => {
      const other = "0x" + "11".repeat(32);
      expect(() => parseBundleRef({ rootHash: other, metadataURI: `ipfs://${CID}` })).toThrow(
        /inconsistent/,
      );
    });

    it("0g:// metadataURI with matching hash", () => {
      expect(parseBundleRef({ rootHash: DIGEST, metadataURI: `0g://${DIGEST}` })).toEqual({
        backend: "0g",
        ref: DIGEST,
      });
    });

    it("0g:// metadataURI with mismatched hash throws", () => {
      expect(() =>
        parseBundleRef({ rootHash: "0x" + "22".repeat(32), metadataURI: `0g://${DIGEST}` }),
      ).toThrow(/inconsistent/);
    });

    it("empty metadataURI falls back to 0G by rootHash (legacy)", () => {
      expect(parseBundleRef({ rootHash: DIGEST, metadataURI: "" })).toEqual({
        backend: "0g",
        ref: DIGEST,
      });
    });

    it("https docs link falls back to 0G by rootHash", () => {
      expect(parseBundleRef({ rootHash: DIGEST, metadataURI: "https://docs.example" })).toEqual({
        backend: "0g",
        ref: DIGEST,
      });
    });
  });

  it("backendForRef classifies user refs", () => {
    expect(backendForRef(`ipfs://${CID}`)).toBe("ipfs");
    expect(backendForRef(CID)).toBe("ipfs");
    expect(backendForRef(`0g://${DIGEST}`)).toBe("0g");
    expect(backendForRef(DIGEST)).toBeUndefined();
  });
});
