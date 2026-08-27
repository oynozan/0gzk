"use client";

import type { CircuitMetadata, InputSpec } from "@0gzk/sdk";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";

export type InputState = Record<string, string | boolean>;

export function buildInitialState(metadata: CircuitMetadata): InputState {
  const state: InputState = {};
  for (const [name, spec] of Object.entries(metadata.inputs)) {
    state[name] = spec.type === "bool" ? false : "";
  }
  return state;
}

export function inputsForProver(
  raw: InputState,
  metadata: CircuitMetadata,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(metadata.inputs)) {
    const value = raw[name];
    if (spec.type === "bool") {
      out[name] = value === true;
    } else {
      out[name] = value;
    }
  }
  return out;
}

function FieldShell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(8ch, 18ch) 1fr auto",
        gap: "var(--space-8)",
        alignItems: "center",
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--type-14)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function DynamicInputForm({
  metadata,
  state,
  onChange,
  disabled,
}: {
  metadata: CircuitMetadata;
  state: InputState;
  onChange: (name: string, value: string | boolean) => void;
  disabled: boolean;
}) {
  const entries = useMemo(() => Object.entries(metadata.inputs), [metadata]);

  return (
    <div>
      {entries.map(([name, spec], idx) => (
        <Field
          key={name}
          name={name}
          spec={spec}
          value={state[name] ?? (spec.type === "bool" ? false : "")}
          onChange={(v) => onChange(name, v)}
          disabled={disabled}
          delayIndex={idx}
        />
      ))}
    </div>
  );
}

function Field({
  name,
  spec,
  value,
  onChange,
  disabled,
  delayIndex,
}: {
  name: string;
  spec: InputSpec;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  disabled: boolean;
  delayIndex: number;
}) {
  const tag = spec.visibility === "private" ? "PRV" : "PUB";
  const tagColor = spec.visibility === "private" ? "var(--accent)" : "var(--text-mute)";

  return (
    <FieldShell
      style={{
        animation: "specRowIn 320ms var(--ease-out-quart) both",
        animationDelay: `${delayIndex * 30}ms`,
      }}
    >
      <div
        style={{
          color: "var(--text-mute)",
          letterSpacing: "0.06em",
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "baseline",
        }}
        title={spec.description}
      >
        <span>{name.toUpperCase()}</span>
        <span
          style={{
            fontSize: "var(--type-12)",
            color: tagColor,
            letterSpacing: "0.05em",
          }}
        >
          [{tag}]
        </span>
      </div>
      <div>
        {spec.type === "bool" ? (
          <BoolInput
            value={value === true}
            onChange={onChange}
            disabled={disabled}
          />
        ) : (
          <NumInput
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
      <div style={{ color: "var(--text-mute)", whiteSpace: "nowrap", fontSize: "var(--type-12)" }}>
        {spec.type}
      </div>
    </FieldShell>
  );
}

function NumInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder="…"
      style={{
        width: "100%",
        background: "var(--surface-1)",
        border: "1px solid var(--rule)",
        padding: "var(--space-2) var(--space-3)",
        color: "var(--text)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--type-14)",
      }}
    />
  );
}

function BoolInput({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)" }}>
      {[true, false].map((opt) => {
        const active = value === opt;
        return (
          <button
            key={String(opt)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "1px solid var(--rule-strong)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-12)",
              letterSpacing: "0.08em",
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--bg)" : "var(--text-dim)",
            }}
          >
            {opt ? "TRUE" : "FALSE"}
          </button>
        );
      })}
    </div>
  );
}
