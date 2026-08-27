import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--rule)",
        padding: "0 24px 0 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-6)",
        }}
      >
        <Link
          href="/"
          aria-label="0gzk · home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-44)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          <Image
            src="/logo.png"
            alt=""
            width={120}
            height={120}
            priority
            style={{ display: "block", width: "120px", height: "120px" }}
          />
        </Link>
        <nav
          style={{
            display: "flex",
            gap: "var(--space-5)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-12)",
            letterSpacing: "0.08em",
          }}
        >
          <Link href="/prove">PROVE</Link>
          <Link href="/inspect">INSPECT</Link>
          <Link href="/whitepaper">WHITEPAPER</Link>
          <a href="https://github.com/0gzk/core" target="_blank" rel="noopener noreferrer">
            SOURCE
          </a>
        </nav>
      </div>
    </header>
  );
}
