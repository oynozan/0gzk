"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

export interface CircuitRow {
  name: string;
  owner: string;
  versionCount: number;
  latestVersion: string;
}

function trunc(addr: string, head = 6, tail = 4) {
  if (!addr.startsWith("0x") || addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, 2 + head)}…${addr.slice(-tail)}`;
}

const HEADER_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) auto auto",
  gap: "var(--space-5)",
  alignItems: "baseline",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--rule-strong)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-12)",
  color: "var(--text-mute)",
  letterSpacing: "0.06em",
};

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) auto auto",
  gap: "var(--space-5)",
  alignItems: "baseline",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--rule)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-14)",
  color: "var(--text)",
  textDecoration: "none",
  transition: "background var(--duration-fast) var(--ease-out-quart)",
};

const NAME_STYLE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  letterSpacing: "0.04em",
};

const OWNER_STYLE: React.CSSProperties = {
  color: "var(--text-mute)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const VERSION_STYLE: React.CSSProperties = {
  color: "var(--text-mute)",
  fontSize: "var(--type-12)",
  whiteSpace: "nowrap",
};

const PROVE_STYLE: React.CSSProperties = {
  color: "var(--ok)",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};

const FILTER_INPUT_STYLE: React.CSSProperties = {
  all: "unset",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-14)",
  color: "var(--text)",
  borderBottom: "1px solid var(--rule-strong)",
  padding: "2px 0",
  width: "min(100%, 36ch)",
  caretColor: "var(--accent)",
  outline: "none",
};

export function CircuitTable({ rows }: { rows: CircuitRow[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.latestVersion.toLowerCase().includes(q) ||
        row.owner.toLowerCase().includes(q),
    );
  }, [deferred, rows]);

  const stale = deferred !== query;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "var(--space-4)",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "var(--space-3) 0",
          marginBottom: "var(--space-2)",
        }}
      >
        <label
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "baseline",
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-12)",
              color: "var(--text-mute)",
              letterSpacing: "0.06em",
            }}
          >
            FILTER
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="name, version, or owner…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={FILTER_INPUT_STYLE}
          />
        </label>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-12)",
            color: "var(--text-mute)",
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
          }}
        >
          {query
            ? `${filtered.length}/${rows.length}${stale ? " · …" : ""}`
            : `${rows.length} circuit${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div role="table">
        <div role="row" style={HEADER_STYLE}>
          <span>NAME</span>
          <span>OWNER</span>
          <span style={{ textAlign: "right" }}>VERSION</span>
          <span style={{ textAlign: "right" }}>{"\u00a0"}</span>
        </div>

        {filtered.length === 0 ? (
          <div
            style={{
              padding: "var(--space-4) 0",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-14)",
              color: "var(--text-mute)",
            }}
          >
            no matches
          </div>
        ) : (
          filtered.map((row) => {
            const spec = `${row.name}@${row.latestVersion}`;
            return (
              <Link
                key={row.name}
                role="row"
                href={`/prove?name=${encodeURIComponent(spec)}`}
                title={row.name}
                style={ROW_STYLE}
                className="circuit-row"
              >
                <span style={NAME_STYLE}>{row.name}</span>
                <span style={OWNER_STYLE} title={row.owner}>
                  {trunc(row.owner)}
                </span>
                <span style={{ ...VERSION_STYLE, textAlign: "right" }}>
                  v{row.latestVersion}
                  {row.versionCount > 1 ? ` · ${row.versionCount}` : ""}
                </span>
                <span style={PROVE_STYLE}>PROVE ▸</span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
