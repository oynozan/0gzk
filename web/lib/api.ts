import type { BundleFiles, CircuitMetadata } from "@0gzk/sdk";
import { base64ToBytes } from "./decode";

export interface RegistryAttribution {
  name: string;
  version: string;
  vkeyHash: string;
  verifier: string;
  publisher: string;
  publishedAt: number;
  metadataURI: string;
}

interface BundleApiResponse {
  rootHash: string;
  metadata: CircuitMetadata;
  vkey: unknown;
  wasm: string;
  zkey: string;
  sizes: { wasm: number; zkey: number };
  cached: boolean;
  registry: RegistryAttribution | null;
}

interface BundleApiError {
  error: string;
  detail?: string;
}

export interface FetchBundleResult {
  bundle: BundleFiles;
  rootHash: string;
  sizes: { wasm: number; zkey: number };
  vkeyBytes: number;
  cached: boolean;
  registry: RegistryAttribution | null;
}

export type BundleSource =
  | { kind: "rootHash"; rootHash: string }
  | { kind: "name"; spec: string };

function buildUrl(source: BundleSource): string {
  if (source.kind === "rootHash") {
    return `/api/bundle?rootHash=${encodeURIComponent(source.rootHash)}`;
  }
  return `/api/bundle?name=${encodeURIComponent(source.spec)}`;
}

export async function fetchBundleFromApi(
  rootHash: string,
): Promise<FetchBundleResult> {
  return fetchBundleFromApiBy({ kind: "rootHash", rootHash });
}

export async function fetchBundleByName(
  spec: string,
): Promise<FetchBundleResult> {
  return fetchBundleFromApiBy({ kind: "name", spec });
}

export async function fetchBundleFromApiBy(
  source: BundleSource,
): Promise<FetchBundleResult> {
  const res = await fetch(buildUrl(source), { method: "GET" });

  if (!res.ok) {
    let message = `bundle fetch failed: HTTP ${res.status}`;
    try {
      const body = (await res.json()) as BundleApiError;
      if (body.error) {
        message = body.detail ? `${body.error}: ${body.detail}` : body.error;
      }
    } catch {
      // ignore JSON parse failures, fall through with default message
    }
    throw new Error(message);
  }

  const body = (await res.json()) as BundleApiResponse;
  const wasm = base64ToBytes(body.wasm);
  const zkey = base64ToBytes(body.zkey);
  const vkeyBytes = new TextEncoder().encode(JSON.stringify(body.vkey)).byteLength;

  return {
    bundle: {
      metadata: body.metadata,
      vkey: body.vkey,
      wasm,
      zkey,
    },
    rootHash: body.rootHash,
    sizes: body.sizes,
    vkeyBytes,
    cached: body.cached,
    registry: body.registry,
  };
}
