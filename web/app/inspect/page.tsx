"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BundleFiles } from "@0gzk/sdk";

import { BundleHeader } from "@/components/BundleHeader";
import { FileList } from "@/components/FileList";
import { HashInput } from "@/components/HashInput";
import { Block, Row } from "@/components/SpecSheet";
import { StatusVerb } from "@/components/StatusVerb";
import {
  fetchBundleByName,
  fetchBundleFromApi,
  type RegistryAttribution,
} from "@/lib/api";

type Phase =
  | { kind: "idle" }
  | { kind: "fetching"; label: string }
  | {
      kind: "ready";
      rootHash: string;
      bundle: BundleFiles;
      sizes: { wasm: number; zkey: number };
      vkeyBytes: number;
      cached: boolean;
      registry: RegistryAttribution | null;
    };

export default function InspectPageWrapper() {
  return (
    <Suspense fallback={null}>
      <InspectPage />
    </Suspense>
  );
}

function InspectPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const autoLoaded = useRef(false);

  const onLoadByHash = useCallback(async (rootHash: string) => {
    setError(null);
    setPhase({ kind: "fetching", label: rootHash });
    try {
      const result = await fetchBundleFromApi(rootHash);
      setPhase({
        kind: "ready",
        rootHash: result.rootHash,
        bundle: result.bundle,
        sizes: result.sizes,
        vkeyBytes: result.vkeyBytes,
        cached: result.cached,
        registry: result.registry,
      });
    } catch (err) {
      setPhase({ kind: "idle" });
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onLoadByName = useCallback(async (spec: string) => {
    setError(null);
    setPhase({ kind: "fetching", label: spec });
    try {
      const result = await fetchBundleByName(spec);
      setPhase({
        kind: "ready",
        rootHash: result.rootHash,
        bundle: result.bundle,
        sizes: result.sizes,
        vkeyBytes: result.vkeyBytes,
        cached: result.cached,
        registry: result.registry,
      });
    } catch (err) {
      setPhase({ kind: "idle" });
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (autoLoaded.current) return;
    const name = searchParams?.get("name");
    const rh = searchParams?.get("rootHash");
    if (name) {
      autoLoaded.current = true;
      onLoadByName(name);
    } else if (rh) {
      autoLoaded.current = true;
      onLoadByHash(rh);
    }
  }, [searchParams, onLoadByName, onLoadByHash]);

  return (
    <div>
      <Block title="ROOT HASH" index="§ 01">
        <Row
          label="INPUT"
          value={
            <HashInput
              busy={phase.kind === "fetching"}
              onSubmit={onLoadByHash}
              initial={phase.kind === "ready" ? phase.rootHash : ""}
            />
          }
        />
        <Row
          label="STATE"
          value={
            phase.kind === "idle" ? (
              <span style={{ color: "var(--text-mute)" }}>AWAITING INPUT</span>
            ) : phase.kind === "fetching" ? (
              <StatusVerb text="FETCHING FROM 0G STORAGE" blink />
            ) : (
              <StatusVerb
                text={
                  "BUNDLE LOADED" + (phase.cached ? " (CACHE HIT)" : " (DOWNLOADED)")
                }
                color="var(--ok)"
              />
            )
          }
        />
      </Block>

      {error ? (
        <div
          style={{
            marginTop: "var(--space-5)",
            padding: "var(--space-3) var(--space-4)",
            border: "1px solid var(--err)",
            color: "var(--err)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-12)",
            letterSpacing: "0.04em",
          }}
        >
          ERROR · {error.toUpperCase()}
        </div>
      ) : null}

      {phase.kind === "ready" ? (
        <>
          <BundleHeader
            metadata={phase.bundle.metadata}
            rootHash={phase.rootHash}
            registry={phase.registry}
          />
          <FileList sizes={phase.sizes} vkeyBytes={phase.vkeyBytes} />

          <Block title="INPUT SCHEMA" index="§ 04">
            {Object.entries(phase.bundle.metadata.inputs).map(
              ([name, spec], idx) => (
                <Row
                  key={name}
                  label={name.toUpperCase()}
                  value={spec.description ?? "—"}
                  unit={
                    <span
                      style={{
                        color:
                          spec.visibility === "private"
                            ? "var(--accent)"
                            : "var(--text-mute)",
                      }}
                    >
                      {spec.type} · {spec.visibility.toUpperCase()}
                    </span>
                  }
                  delayIndex={idx}
                />
              ),
            )}
          </Block>

          <Block title="OUTPUT SCHEMA" index="§ 05">
            {Object.entries(phase.bundle.metadata.outputs).map(
              ([name, spec], idx) => (
                <Row
                  key={name}
                  label={name.toUpperCase()}
                  value={spec.description ?? "—"}
                  unit={spec.type}
                  delayIndex={idx}
                />
              ),
            )}
          </Block>
        </>
      ) : null}
    </div>
  );
}
