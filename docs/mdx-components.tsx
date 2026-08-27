import type { MDXComponents } from "nextra/mdx-components";
import { useMDXComponents as useThemeMDXComponents } from "nextra-theme-docs";

export function useMDXComponents(components: MDXComponents) {
  return useThemeMDXComponents(components);
}
