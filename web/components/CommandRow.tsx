"use client";

import { useState } from "react";

/** One-line shell command with a click-to-copy affordance, spec-sheet style. */
export function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions, http): the text is selectable.
    }
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "var(--space-3)",
        maxWidth: "100%",
      }}
    >
      <code style={{ color: "var(--text)", overflowWrap: "anywhere" }}>
        <span style={{ color: "var(--text-mute)" }}>$ </span>
        {text}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy command: ${text}`}
        style={{
          border: "1px solid var(--rule)",
          background: "none",
          color: copied ? "var(--ok)" : "var(--text-mute)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--type-12)",
          letterSpacing: "0.08em",
          padding: "1px 6px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </span>
  );
}

/** Multi-line terminal excerpt. */
export function Term({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: "var(--space-3) 0 0",
        padding: "var(--space-4)",
        border: "1px solid var(--rule)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--type-12)",
        lineHeight: 1.7,
        color: "var(--text)",
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}
