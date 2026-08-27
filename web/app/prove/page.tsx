"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BundleFiles, ProofResult as SdkProofResult } from "@0gzk/sdk";
import {
  generateProof,
  validateInputs,
  verifyLocal,
} from "@0gzk/sdk";

type Groth16Proof = SdkProofResult["proof"];

import { BundleHeader } from "@/components/BundleHeader";
import { Counter } from "@/components/Counter";
import {
  buildInitialState,
  DynamicInputForm,
  inputsForProver,
  type InputState,
} from "@/components/DynamicInputForm";
import { FileList } from "@/components/FileList";
import { HashInput } from "@/components/HashInput";
import { ProofResult } from "@/components/ProofResult";
import { Block, Row } from "@/components/SpecSheet";
import { StatusVerb } from "@/components/StatusVerb";
import {
  fetchBundleByName,
  fetchBundleFromApi,
  type RegistryAttribution,
} from "@/lib/api";

type LoadedBase = {
  rootHash: string;
  bundle: BundleFiles;
  sizes: { wasm: number; zkey: number };
  vkeyBytes: number;
  cached: boolean;
  registry: RegistryAttribution | null;
};

type Phase =
  | { kind: "idle" }
  | { kind: "fetching"; label: string }
  | ({ kind: "ready" } & LoadedBase)
  | ({
      kind: "proving";
      stage: "WITNESS" | "PROVING" | "VERIFYING";
      startedAt: number;
    } & LoadedBase)
  | ({
      kind: "done";
      proof: Groth16Proof;
      publicSignals: string[];
      verified: boolean;
      proofMs: number;
    } & LoadedBase);

export default function ProvePageWrapper() {
  return (
    <Suspense fallback={null}>
      <ProvePage />
    </Suspense>
  );
}

function ProvePage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [inputs, setInputs] = useState<InputState>({});
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const autoLoaded = useRef(false);

  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof fetchBundleFromApi>>) => {
      setInputs(buildInitialState(result.bundle.metadata));
      setPhase({
        kind: "ready",
        rootHash: result.rootHash,
        bundle: result.bundle,
        sizes: result.sizes,
        vkeyBytes: result.vkeyBytes,
        cached: result.cached,
        registry: result.registry,
      });
    },
    [],
  );

  const onLoadByHash = useCallback(
    async (rootHash: string) => {
      setError(null);
      setPhase({ kind: "fetching", label: rootHash });
      try {
        const result = await fetchBundleFromApi(rootHash);
        applyResult(result);
      } catch (err) {
        setPhase({ kind: "idle" });
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [applyResult],
  );

  const onLoadByName = useCallback(
    async (spec: string) => {
      setError(null);
      setPhase({ kind: "fetching", label: spec });
      try {
        const result = await fetchBundleByName(spec);
        applyResult(result);
      } catch (err) {
        setPhase({ kind: "idle" });
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [applyResult],
  );

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

  const onProve = useCallback(async () => {
    if (phase.kind !== "ready" && phase.kind !== "done") return;
    const base: LoadedBase = {
      rootHash: phase.rootHash,
      bundle: phase.bundle,
      sizes: phase.sizes,
      vkeyBytes: phase.vkeyBytes,
      cached: phase.cached,
      registry: phase.registry,
    };

    setError(null);

    let raw: Record<string, unknown>;
    try {
      raw = inputsForProver(inputs, base.bundle.metadata);
      validateInputs(raw, base.bundle.metadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    const startedAt = performance.now();
    setPhase({
      kind: "proving",
      ...base,
      stage: "WITNESS",
      startedAt,
    });

    await new Promise((r) => setTimeout(r, 30));
    setPhase({
      kind: "proving",
      ...base,
      stage: "PROVING",
      startedAt,
    });

    let proof, publicSignals: string[];
    try {
      const result = await generateProof(base.bundle, raw);
      proof = result.proof;
      publicSignals = result.publicSignals;
    } catch (err) {
      setPhase({ kind: "ready", ...base });
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setPhase({
      kind: "proving",
      ...base,
      stage: "VERIFYING",
      startedAt,
    });

    let verified = false;
    try {
      verified = await verifyLocal(base.bundle, { proof, publicSignals });
    } catch (err) {
      setError(
        `Verification threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const proofMs = performance.now() - startedAt;
    setPhase({
      kind: "done",
      ...base,
      proof,
      publicSignals,
      verified,
      proofMs,
    });
  }, [phase, inputs]);

  return (
    <div>
      <Block title="ROOT HASH" index="§ 01">
        <Row
          label="INPUT"
          value={
            <HashInput
              busy={phase.kind === "fetching" || phase.kind === "proving"}
              onSubmit={onLoadByHash}
              initial={
                phase.kind === "ready" ||
                phase.kind === "proving" ||
                phase.kind === "done"
                  ? phase.rootHash
                  : ""
              }
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
            ) : phase.kind === "ready" ? (
              <StatusVerb
                text={
                  "BUNDLE READY" + (phase.cached ? " (CACHE HIT)" : " (DOWNLOADED)")
                }
                color="var(--ok)"
              />
            ) : phase.kind === "proving" ? (
              <StatusVerb
                text={
                  phase.stage === "WITNESS"
                    ? "COMPUTING WITNESS"
                    : phase.stage === "PROVING"
                      ? "PROVING"
                      : "VERIFYING"
                }
                blink
              />
            ) : phase.verified ? (
              <StatusVerb text="VERIFIED" color="var(--ok)" />
            ) : (
              <StatusVerb text="UNVERIFIED" color="var(--err)" />
            )
          }
          unit={
            phase.kind === "proving" ? (
              <Counter startedAt={phase.startedAt} active />
            ) : phase.kind === "done" ? (
              <Counter startedAt={null} active={false} finalMs={phase.proofMs} />
            ) : undefined
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

      {phase.kind !== "idle" && phase.kind !== "fetching" ? (
        <>
          <Block title="WITNESS" index="§ 02">
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--type-12)",
                color: "var(--text-mute)",
                letterSpacing: "0.02em",
                padding: "var(--space-3) 0",
                borderBottom: "1px solid var(--rule-strong)",
                marginBottom: "var(--space-3)",
              }}
            >
              Inputs stay in this tab. Only the resulting proof leaves.
            </div>
            <DynamicInputForm
              metadata={phase.bundle.metadata}
              state={inputs}
              onChange={(name, value) =>
                setInputs((prev) => ({ ...prev, [name]: value }))
              }
              disabled={phase.kind === "proving"}
            />
          </Block>

          <Block title="EXECUTE" index="§ 03">
            <div
              style={{
                padding: "var(--space-3) 0 var(--space-2)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--type-14)",
                color: "var(--text)",
                letterSpacing: "0.02em",
              }}
            >
              Generate the proof here in the browser, then verify it the same
              way the on-chain verifier would.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: "var(--space-4)",
                padding: "var(--space-4) 0",
              }}
            >
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--type-12)",
                  color: "var(--text-mute)",
                  letterSpacing: "0.04em",
                }}
              >
                snarkjs.groth16.fullProve(inputs, wasm, zkey)
              </code>
              <button
                type="button"
                onClick={onProve}
                disabled={phase.kind === "proving"}
                style={{
                  padding: "var(--space-3) var(--space-6)",
                  border: "1px solid var(--accent)",
                  background:
                    phase.kind === "proving" ? "var(--surface-1)" : "var(--accent)",
                  color: phase.kind === "proving" ? "var(--text-mute)" : "var(--bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--type-14)",
                  letterSpacing: "0.12em",
                  cursor: phase.kind === "proving" ? "not-allowed" : "pointer",
                  transition:
                    "background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart)",
                }}
              >
                {phase.kind === "proving" ? "▸▸▸ RUNNING" : "▸ PROVE"}
              </button>
            </div>
          </Block>

          {phase.kind === "done" ? (
            <ProofResult
              proof={phase.proof}
              publicSignals={phase.publicSignals}
              summary={{
                circuit: `${phase.bundle.metadata.name} v${phase.bundle.metadata.version}`,
                protocol: phase.bundle.metadata.protocol,
                curve: phase.bundle.metadata.curve,
                proofMs: phase.proofMs,
                verified: phase.verified,
                rootHash: phase.rootHash,
              }}
              index="§ 04"
            />
          ) : null}

          <BundleHeader
            metadata={phase.bundle.metadata}
            rootHash={phase.rootHash}
            registry={phase.registry}
            index="§ 05"
          />
          <FileList
            sizes={phase.sizes}
            vkeyBytes={phase.vkeyBytes}
            index="§ 06"
          />
        </>
      ) : null}
    </div>
  );
}
