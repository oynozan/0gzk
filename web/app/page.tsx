import Link from "next/link";

import { CircuitTable } from "@/components/CircuitTable";
import { Block, Row } from "@/components/SpecSheet";
import { listAllCircuits } from "@/lib/server/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function HomePage() {
  let circuits: Awaited<ReturnType<typeof listAllCircuits>> = [];
  let circuitsError: string | null = null;
  try {
    circuits = await listAllCircuits({ offset: 0, limit: 200 });
  } catch (err) {
    circuitsError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <p
        style={{
          margin: "var(--space-5) 0 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--type-14)",
          color: "var(--text-mute)",
          letterSpacing: "0.02em",
          maxWidth: "60ch",
        }}
      >
        Pick a circuit. Prove it in your browser. The inputs never leave this tab.
      </p>

      <Block title="CIRCUITS" index="§ 01">
        {circuitsError ? (
          <Row label="ERROR" value={circuitsError.toUpperCase()} />
        ) : circuits.length === 0 ? (
          <Row
            label="—"
            value="no circuits registered yet (or registry address not configured)"
          />
        ) : (
          <CircuitTable rows={circuits} />
        )}
      </Block>

      <Block title="LINKS" index="§ 02">
        <Row
          label="WHITEPAPER"
          value={
            <Link href="/whitepaper" style={{ color: "var(--accent)" }}>
              /whitepaper ▸
            </Link>
          }
          unit="what this is, how it works"
        />
        <Row
          label="CLI"
          value={
            <code style={{ color: "var(--text)" }}>
              npm i -g @0gzk/cli
            </code>
          }
          unit="local prover"
        />
        <Row
          label="SDK"
          value={
            <code style={{ color: "var(--text)" }}>
              npm i @0gzk/sdk
            </code>
          }
          unit="for your own app"
        />
        <Row
          label="DOCS"
          value={
            <span style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
              <a
                href="https://github.com/0gzk/core/blob/main/README.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text)" }}
              >
                README ▸
              </a>
              <a
                href="https://github.com/0gzk/core/blob/main/packages/sdk/USAGE.md"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text)" }}
              >
                SDK USAGE ▸
              </a>
              <a
                href="https://github.com/0gzk/core"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text)" }}
              >
                SOURCE ▸
              </a>
            </span>
          }
        />
      </Block>
    </div>
  );
}
