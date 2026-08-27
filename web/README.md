# 0gzk web

Engineering-spec interface for browser-side ZK proving on 0G Storage.

Witness data never leaves the browser. The Next.js server fetches the public circuit bundle from 0G Storage and streams it to the client; `snarkjs.groth16.fullProve` runs in-process via [`@0gzk/sdk`](https://www.npmjs.com/package/@0gzk/sdk).

## Run

```bash
cp .env.template .env.local       # only needed if you want to override defaults
pnpm install --ignore-workspace
pnpm dev
# http://localhost:3000/prove
```

`--ignore-workspace` keeps pnpm from walking up to the parent monorepo. `web/` consumes `@0gzk/sdk` from npm like any other downstream project.

`OG_PRIVATE_KEY` is **not** required (read-only). Every other knob is documented in [`.env.template`](./.env.template).

### Run against Galileo testnet

```bash
OG_NETWORK=testnet NEXT_PUBLIC_OG_NETWORK=testnet pnpm dev
```

## Build

```bash
pnpm build
pnpm start
```

## License

MIT
