import type { Metadata } from "next";
import { loadConfig } from "@0gzk/sdk/node";
import "./globals.css";
import { Header } from "@/components/Header";
import { StatusLine } from "@/components/StatusLine";

const BUILD_VERSION = "0.3.0";

export const metadata: Metadata = {
  title: "0gzk — ZK proving on 0G Storage",
  description:
    "Engineering-spec interface for in-browser ZK Groth16 proving on 0G Storage. Witnesses never leave the device.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "0gzk — ZK proving on 0G Storage",
    description:
      "Publish a Circom circuit once. Anyone can prove against it client-side. Witnesses never leave the device.",
    images: [{ url: "/logo.png", width: 1024, height: 1024, alt: "0gzk" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "0gzk — ZK proving on 0G Storage",
    description:
      "Publish a Circom circuit once. Anyone can prove against it client-side.",
    images: ["/logo.png"],
  },
};

function indexerHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = loadConfig({});

  return (
    <html lang="en">
      <body>
        <Header />
        <main
          style={{
            padding: "var(--space-5) clamp(16px, 4vw, 48px) var(--space-9)",
            maxWidth: "1080px",
            margin: "0 auto",
          }}
        >
          {children}
        </main>
        <StatusLine
          network={cfg.network}
          indexer={indexerHost(cfg.indexerUrl)}
          build={BUILD_VERSION}
        />
      </body>
    </html>
  );
}
