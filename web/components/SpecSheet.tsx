import type { CSSProperties, ReactNode } from "react";

export function Block({
  title,
  index,
  children,
  style,
}: {
  title: string;
  index?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        marginTop: "var(--space-7)",
        ...style,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "baseline",
          gap: "var(--space-3)",
          paddingBottom: "var(--space-2)",
          marginBottom: "var(--space-3)",
          borderBottom: "1px solid var(--rule-strong)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-20)",
            fontWeight: 400,
            letterSpacing: "0.02em",
            color: "var(--text)",
          }}
        >
          {title}
        </h2>
        {index ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-12)",
              color: "var(--text-mute)",
              letterSpacing: "0.05em",
              textAlign: "right",
            }}
          >
            {index}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Row({
  label,
  value,
  unit,
  tag,
  style,
  delayIndex,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  tag?: "PUB" | "PRV" | "OUT";
  style?: CSSProperties;
  delayIndex?: number;
}) {
  const tagColor =
    tag === "PRV"
      ? "var(--accent)"
      : tag === "OUT"
        ? "var(--ok)"
        : "var(--text-mute)";

  const animStyle: CSSProperties =
    typeof delayIndex === "number"
      ? {
          animation: `specRowIn 320ms var(--ease-out-quart) both`,
          animationDelay: `${delayIndex * 30}ms`,
        }
      : {};

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(8ch, 18ch) 1fr auto",
        gap: "var(--space-8)",
        alignItems: "baseline",
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--type-14)",
        ...animStyle,
        ...style,
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
      >
        <span>{label}</span>
        {tag ? (
          <span
            style={{
              fontSize: "var(--type-12)",
              color: tagColor,
              letterSpacing: "0.05em",
            }}
          >
            [{tag}]
          </span>
        ) : null}
      </div>
      <div style={{ color: "var(--text)", overflowWrap: "anywhere", minWidth: 0 }}>
        {value}
      </div>
      <div style={{ color: "var(--text-mute)", whiteSpace: "nowrap", fontSize: "var(--type-12)" }}>
        {unit ?? ""}
      </div>
    </div>
  );
}
