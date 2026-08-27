import { generateStaticParamsFor, importPage } from "nextra/pages";
import { notFound } from "next/navigation";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";
import type { ComponentType, ReactNode } from "react";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

const NON_MDX_FIRST_SEGMENTS = new Set([
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "favicon.png",
  "apple-touch-icon.png",
  "apple-touch-icon-precomposed.png",
  "manifest.json",
  "manifest.webmanifest",
  ".well-known",
]);

async function importPageSafe(mdxPath: string[] | undefined) {
  if (mdxPath && mdxPath.length > 0 && NON_MDX_FIRST_SEGMENTS.has(mdxPath[0]!)) {
    notFound();
  }
  try {
    return await importPage(mdxPath);
  } catch {
    notFound();
  }
}

export async function generateMetadata(props: {
  params: Promise<{ mdxPath?: string[] }>;
}) {
  const params = await props.params;
  const { metadata } = await importPageSafe(params.mdxPath);
  return metadata;
}

const Wrapper = getMDXComponents({}).wrapper as ComponentType<{
  children: ReactNode;
  toc: unknown;
  metadata: unknown;
  sourceCode?: string;
}>;

export default async function Page(props: {
  params: Promise<{ mdxPath?: string[] }>;
}) {
  const params = await props.params;
  const {
    default: MDXContent,
    toc,
    metadata,
    sourceCode,
  } = await importPageSafe(params.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
