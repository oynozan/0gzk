import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { cidToRootHash, rootHashToCidV0, isRootHash } from "../../bundle-ref.js";
import type { BundleFiles } from "../../types.js";
import type { StorageConfig } from "../config.js";
import type { UploadOptions } from "../storage-types.js";
import { makeEmitter } from "../upload-internals.js";
import {
  TAR_NAME,
  extractTarball,
  makeTempDir,
  packBundle,
  pathExists,
  readBundleFromDir,
} from "./shared.js";
import type { StorageBackend, StorageUploadResult } from "./types.js";

/**
 * IPFS backend: uploads through any pinFileToIPFS-compatible pinning API
 * (Pinata-style; one authenticated multipart POST, no wallet, no gas) and
 * fetches through a plain HTTP gateway. Bundles are pinned as CIDv0 so the
 * sha2-256 digest doubles as the registry's bytes32 rootHash.
 */
/** Tried in order after the configured gateway; first success wins. */
const FALLBACK_GATEWAYS = [
  "https://gateway.pinata.cloud",
  "https://ipfs.io",
  "https://dweb.link",
  "https://w3s.link",
];

const GATEWAY_TIMEOUT_MS = 30_000;

export class IpfsStorageBackend implements StorageBackend {
  readonly id = "ipfs" as const;

  constructor(private readonly config: Pick<StorageConfig, "ipfs">) {}

  async upload(bundleDir: string, options: UploadOptions = {}): Promise<StorageUploadResult> {
    const { apiUrl, apiToken } = this.config.ipfs;
    if (!apiToken) {
      throw new Error(
        "Missing IPFS API token. Set OGZK_IPFS_API_TOKEN (a Pinata-style JWT) " +
          "or `0gzk config set ipfsApiToken <token>` before publishing with --storage ipfs.",
      );
    }

    const absBundleDir = path.resolve(bundleDir);
    if (!(await pathExists(absBundleDir))) {
      throw new Error(`Bundle directory does not exist: ${absBundleDir}`);
    }

    const emit = makeEmitter(options.onProgress);
    emit({ stage: "packing", message: "Packing bundle tarball" });
    const tarPath = await packBundle(absBundleDir);
    const tarTmpDir = path.dirname(tarPath);

    try {
      const bytes = await fs.readFile(tarPath);
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)]),
        TAR_NAME,
      );
      // CIDv0 keeps the CID bijective with a bytes32 digest (see bundle-ref.ts).
      form.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
      form.append("pinataMetadata", JSON.stringify({ name: `0gzk ${TAR_NAME}` }));

      emit({ stage: "submitting", message: "Uploading tarball to IPFS pinning service" });

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}` },
        body: form,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `IPFS upload failed: ${response.status} ${response.statusText}` +
            (body ? ` — ${body.slice(0, 300)}` : ""),
        );
      }

      const payload = (await response.json()) as { IpfsHash?: string };
      const cid = payload.IpfsHash;
      if (!cid) {
        throw new Error("IPFS upload response did not include an IpfsHash field.");
      }
      const rootHash = cidToRootHash(cid); // throws on CIDv1/non-sha256

      emit({ stage: "done", message: "Pinned to IPFS", rootHash, finalized: true });
      return {
        rootHash,
        uri: `ipfs://${cid}`,
        backend: "ipfs",
        finalized: true,
      };
    } finally {
      await fs.rm(tarTmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async fetch(ref: string, outDir?: string): Promise<BundleFiles> {
    let cid: string;
    if (ref.startsWith("ipfs://")) {
      cid = ref.slice("ipfs://".length);
    } else if (ref.startsWith("Qm")) {
      cid = ref;
    } else if (isRootHash(ref)) {
      cid = rootHashToCidV0(ref);
    } else {
      throw new Error(`Unrecognized IPFS bundle reference: ${ref}`);
    }

    const targetDir =
      outDir !== undefined
        ? path.resolve(outDir)
        : await makeTempDir(`0gzk-fetch-${randomUUID().slice(0, 8)}-`);
    await fs.mkdir(targetDir, { recursive: true });

    // Public gateways fail often (congestion, cold pins), so try the
    // configured one first and fall back through the rest before giving up.
    const configured = this.config.ipfs.gateway.replace(/\/$/, "");
    const gateways = [configured, ...FALLBACK_GATEWAYS.filter((g) => g !== configured)];

    let bytes: Uint8Array | undefined;
    const failures: string[] = [];
    for (const gateway of gateways) {
      const url = `${gateway}/ipfs/${cid}`;
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
        });
        if (!response.ok) {
          failures.push(`${gateway} -> ${response.status} ${response.statusText}`);
          continue;
        }
        bytes = new Uint8Array(await response.arrayBuffer());
        break;
      } catch (err) {
        failures.push(`${gateway} -> ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!bytes) {
      throw new Error(
        `IPFS download failed for ${cid}. Tried ${gateways.length} gateway(s):\n  ` +
          `${failures.join("\n  ")}\nSet a working gateway with OGZK_IPFS_GATEWAY ` +
          "(or `0gzk config set ipfsGateway <url>`).",
      );
    }

    const tarPath = path.join(targetDir, TAR_NAME);
    await fs.writeFile(tarPath, bytes);
    await extractTarball(tarPath, targetDir);
    return readBundleFromDir(targetDir);
  }
}
