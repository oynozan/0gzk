import { NextResponse } from "next/server";
import {
  resolveBundleByName,
  resolveBundleByRootHash,
  type ResolvedBundle,
} from "@/lib/server/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_SPEC_RE = /^[a-z0-9_-]+(?:@[a-zA-Z0-9._-]+)?$/;

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );
}

function serialize(resolved: ResolvedBundle) {
  return {
    rootHash: resolved.rootHash,
    metadata: resolved.bundle.metadata,
    vkey: resolved.bundle.vkey,
    wasm: bytesToBase64(resolved.bundle.wasm),
    zkey: bytesToBase64(resolved.bundle.zkey),
    sizes: {
      wasm: resolved.bundle.wasm.byteLength,
      zkey: resolved.bundle.zkey.byteLength,
    },
    cached: resolved.cached,
    registry: resolved.registry ?? null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rootHash = url.searchParams.get("rootHash");
  const name = url.searchParams.get("name");

  if (!rootHash && !name) {
    return NextResponse.json(
      { error: "Missing query parameter (expected rootHash or name)" },
      { status: 400 },
    );
  }

  if (rootHash && name) {
    return NextResponse.json(
      { error: "Pass exactly one of rootHash or name, not both" },
      { status: 400 },
    );
  }

  try {
    let resolved: ResolvedBundle;
    if (rootHash) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(rootHash)) {
        return NextResponse.json(
          { error: "Invalid rootHash (expected 0x + 64 hex chars)" },
          { status: 400 },
        );
      }
      resolved = await resolveBundleByRootHash(rootHash);
    } else {
      const spec = name as string;
      if (!NAME_SPEC_RE.test(spec)) {
        return NextResponse.json(
          {
            error:
              "Invalid name spec. Expected `<name>` or `<name>@<version>` (lowercase a-z, 0-9, _, -).",
          },
          { status: 400 },
        );
      }
      resolved = await resolveBundleByName(spec);
    }

    return NextResponse.json(serialize(resolved), {
      headers: {
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const target = rootHash ? "0G Storage" : "registry / 0G Storage";
    return NextResponse.json(
      { error: `Failed to resolve bundle from ${target}`, detail: message },
      { status: 502 },
    );
  }
}
