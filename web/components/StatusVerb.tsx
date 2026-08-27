"use client";

import { useEffect, useState } from "react";

const TICK_MS = 25;

export function StatusVerb({
  text,
  blink,
  color,
}: {
  text: string;
  blink?: boolean;
  color?: string;
}) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [text]);

  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        color: color ?? "var(--accent)",
      }}
    >
      {shown}
      {blink ? (
        <span
          style={{
            display: "inline-block",
            width: "0.6ch",
            marginLeft: "0.1ch",
            background: "currentColor",
            height: "1em",
            verticalAlign: "-0.15em",
            animation: "caretBlink 900ms steps(1) infinite",
          }}
        />
      ) : null}
    </span>
  );
}
