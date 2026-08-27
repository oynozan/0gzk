"use client";

import { type FormEvent, useState } from "react";

const HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function HashInput({
  initial,
  busy,
  onSubmit,
}: {
  initial?: string;
  busy: boolean;
  onSubmit: (hash: string) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [touched, setTouched] = useState(false);
  const valid = HASH_RE.test(value.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    onSubmit(value.trim());
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "var(--space-3)",
        alignItems: "stretch",
      }}
    >
      <label
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "baseline",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          border: "1px solid var(--rule-strong)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--type-14)",
          background: "var(--surface-1)",
        }}
      >
        <span
          style={{
            color: "var(--text-mute)",
            letterSpacing: "0.06em",
            fontSize: "var(--type-12)",
          }}
        >
          ROOT_HASH
        </span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x0000000000000000000000000000000000000000000000000000000000000000"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          style={{
            width: "100%",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-14)",
            letterSpacing: "0.02em",
          }}
        />
      </label>
      <button
        type="submit"
        disabled={!valid || busy}
        style={{
          padding: "0 var(--space-5)",
          border: "1px solid var(--rule-strong)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--type-12)",
          letterSpacing: "0.12em",
          background: valid && !busy ? "var(--accent)" : "var(--surface-1)",
          color: valid && !busy ? "var(--bg)" : "var(--text-mute)",
          cursor: valid && !busy ? "pointer" : "not-allowed",
          transition: "background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart)",
        }}
      >
        {busy ? "LOADING" : "LOAD ▸"}
      </button>
      {touched && !valid && value.length > 0 ? (
        <div
          style={{
            gridColumn: "1 / -1",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-12)",
            color: "var(--err)",
            letterSpacing: "0.04em",
          }}
        >
          INVALID — EXPECTED 0x + 64 HEX CHARS
        </div>
      ) : null}
    </form>
  );
}
