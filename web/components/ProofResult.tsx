"use client";

import type { ProofResult as ProofResultType } from "@0gzk/sdk";
import { Block, Row } from "./SpecSheet";

type Groth16Proof = ProofResultType["proof"];

type ResultSummary = {
  circuit: string;
  protocol: string;
  curve: string;
  proofMs: number;
  verified: boolean;
  rootHash: string;
};

function blobUrl(obj: unknown) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  return URL.createObjectURL(blob);
}

function DownloadLink({
  filename,
  data,
}: {
  filename: string;
  data: unknown;
}) {
  return (
    <a
      href={blobUrl(data)}
      download={filename}
      style={{
        display: "inline-block",
        padding: "var(--space-2) var(--space-4)",
        border: "1px solid var(--rule-strong)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--type-12)",
        letterSpacing: "0.08em",
        color: "var(--text)",
        background: "var(--surface-1)",
      }}
    >
      ↓ {filename}
    </a>
  );
}

export function ProofResult({
  proof,
  publicSignals,
  summary,
  index = "§ 06",
}: {
  proof: Groth16Proof;
  publicSignals: string[];
  summary: ResultSummary;
  index?: string;
}) {
  const result = {
    circuit: summary.circuit,
    protocol: summary.protocol,
    curve: summary.curve,
    rootHash: summary.rootHash,
    proofMs: summary.proofMs,
    verified: summary.verified,
    publicSignals,
  };

  return (
    <Block title="OUTPUT" index={index}>
      <Row
        label="STATUS"
        value={
          summary.verified ? (
            <span style={{ color: "var(--ok)" }}>VERIFIED</span>
          ) : (
            <span style={{ color: "var(--err)" }}>UNVERIFIED</span>
          )
        }
        delayIndex={0}
      />
      <Row
        label="ELAPSED"
        value={summary.proofMs.toFixed(0)}
        unit="ms"
        delayIndex={1}
      />
      <Row
        label="PUBLIC_SIGNALS"
        value={
          <code style={{ color: "var(--text)" }}>
            [{publicSignals.map((s) => `"${s}"`).join(", ")}]
          </code>
        }
        delayIndex={2}
      />
      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          paddingTop: "var(--space-4)",
        }}
      >
        <DownloadLink filename="proof.json" data={proof} />
        <DownloadLink filename="public.json" data={publicSignals} />
        <DownloadLink filename="result.json" data={result} />
      </div>
    </Block>
  );
}
