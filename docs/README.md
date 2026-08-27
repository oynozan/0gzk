# 0gzk documentation (Nextra)

This folder is the **Next.js + Nextra 4** docs site of the 0gzk monorepo. It lives directly in the repo at `docs/` but installs standalone (see the monorepo note below).

## Develop

From this directory (not the monorepo root workspace):

```bash
pnpm install --ignore-workspace
pnpm dev
```

Visit `http://localhost:3000`.

Uses **webpack** for `next dev` / `next build` so **Mermaid** in MDX resolves reliably on Windows (Turbopack still reports limitations for some remark-mermaid paths).

## Build

```bash
pnpm install --ignore-workspace
pnpm build
pnpm start
```

## Patch: `nextra-theme-docs` layout

`nextra-theme-docs@4.6.1` validates `Layout` props with Zod **after** stripping `children`, but the schema still requires `children`, which triggers:

`Invalid input: expected nonoptional, received undefined → at children`

This repo ships a **pnpm patch** ([`patches/nextra-theme-docs@4.6.1.patch`](./patches/nextra-theme-docs@4.6.1.patch)) so `pnpm install` reapplies the fix. Remove the `pnpm.patchedDependencies` entry only if you upgrade to a theme release that includes the upstream fix.

## Stack

- **Next.js** 16.x (App Router)
- **Nextra** 4.6.x + Docs theme

## Monorepo note

If you open the **core** workspace in an IDE, **`pnpm install` at the repo root** will not install these dependencies automatically. Always run installs **inside `docs/`** with **`pnpm install --ignore-workspace`** (or keep this tree outside the parent workspace).

## Configuration you may customize

- **`app/layout.tsx`**: `metadataBase`, `docsRepositoryBase`, navbar links.
- **`app/globals.css`**: brand accent mapped from Nextra primary color tokens.
- **`content/`**: all MDX pages.
