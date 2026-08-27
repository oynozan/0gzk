import type { CircuitMetadata } from "@0gzk/sdk";
import type { RegistryAttribution } from "@/lib/api";
import { getExplorerAddressUrl } from "@/lib/explorer";
import { Block, Row } from "./SpecSheet";

function trunc(hash: string, head = 12, tail = 8) {
  if (hash.length <= head + tail + 2) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function truncAddr(addr: string) {
  if (!addr.startsWith("0x") || addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatPublishedAt(unixSeconds: number) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "—";
  const d = new Date(unixSeconds * 1000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}Z`;
}

export function BundleHeader({
  metadata,
  rootHash,
  registry,
  index = "§ 02",
}: {
  metadata: CircuitMetadata;
  rootHash: string;
  registry?: RegistryAttribution | null;
  index?: string;
}) {
  let cursor = 0;
  const next = () => cursor++;

  return (
    <Block title="BUNDLE" index={index}>
      <Row label="CIRCUIT" value={metadata.name} delayIndex={next()} />
      <Row
        label="VERSION"
        value={metadata.version}
        unit="semver"
        delayIndex={next()}
      />
      <Row
        label="DESCRIPTION"
        value={metadata.description ?? "—"}
        delayIndex={next()}
      />
      <Row label="PROTOCOL" value={metadata.protocol} delayIndex={next()} />
      <Row label="CURVE" value={metadata.curve} delayIndex={next()} />
      <Row
        label="ROOT_HASH"
        value={
          <span title={rootHash}>
            <span style={{ color: "var(--text)" }}>{trunc(rootHash)}</span>
          </span>
        }
        unit="storage CID"
        delayIndex={next()}
      />

      {registry ? (
        <>
          <Row
            label="VKEY_HASH"
            value={
              <span title={registry.vkeyHash}>
                <code style={{ color: "var(--text)" }}>
                  {trunc(registry.vkeyHash)}
                </code>
              </span>
            }
            unit="keccak256"
            delayIndex={next()}
          />
          <Row
            label="VERIFIER"
            value={
              <a
                href={getExplorerAddressUrl(registry.verifier)}
                target="_blank"
                rel="noopener noreferrer"
                title={registry.verifier}
                style={{ color: "var(--text)" }}
              >
                {truncAddr(registry.verifier)}
              </a>
            }
            unit="on-chain"
            delayIndex={next()}
          />
          <Row
            label="PUBLISHER"
            value={
              <a
                href={getExplorerAddressUrl(registry.publisher)}
                target="_blank"
                rel="noopener noreferrer"
                title={registry.publisher}
                style={{ color: "var(--text)" }}
              >
                {truncAddr(registry.publisher)}
              </a>
            }
            delayIndex={next()}
          />
          <Row
            label="PUBLISHED"
            value={formatPublishedAt(registry.publishedAt)}
            unit="UTC"
            delayIndex={next()}
          />
        </>
      ) : null}
    </Block>
  );
}
