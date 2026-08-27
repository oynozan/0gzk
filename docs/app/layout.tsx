import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Inter } from "next/font/google";
import Image from "next/image";
import "nextra-theme-docs/style.css";
import type { Metadata } from "next";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    template: "%s · 0gzk docs",
    default: "0gzk documentation",
  },
  description:
    "Beginner-friendly docs for the 0gzk ecosystem: CLI, SDK, smart contracts, and examples.",
  applicationName: "0gzk docs",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pageContent = await Promise.resolve(children);
  const navbar = (
    <Navbar
      logo={
        <Image
          src="/logo.png"
          alt="Home"
          width={36}
          height={36}
          priority
          className="rounded-md"
        />
      }
      projectLink="https://github.com/0gzk/core"
    />
  );

  const pageMap = await getPageMap();

  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={inter.className}
    >
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={pageMap}
          docsRepositoryBase="https://github.com/0gzk/core/tree/main/docs"
          footer={
            <Footer>
              MIT {new Date().getFullYear()} © 0gzk. ZK on{" "}
              <a href="https://0g.ai/" rel="noreferrer" target="_blank">
                0G
              </a>
              .
            </Footer>
          }
          editLink="Edit this page on GitHub"
          feedback={{
            content: "Question? Give feedback",
            labels: "documentation",
            link: "https://github.com/0gzk/core/issues/new?title=&labels=documentation",
          }}
          sidebar={{ defaultMenuCollapseLevel: 2 }}
          nextThemes={{
            attribute: "class",
            defaultTheme: "dark",
            disableTransitionOnChange: true,
            storageKey: "0gzk-docs-theme",
          }}
        >
          {pageContent}
        </Layout>
      </body>
    </html>
  );
}
