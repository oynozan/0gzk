import Link from "next/link";

import { Block, Row } from "@/components/SpecSheet";

export const runtime = "nodejs";

const REGISTRY_ADDRESS = "0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d";
const CHAIN_NAME = "0G mainnet (chain id 16661)";
const TESTNET_REGISTRY_ADDRESS = "0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6";
const TESTNET_CHAIN_NAME = "0G Galileo testnet (chain id 16602)";
const VERSION = "v0.3.0";
const REVISION_DATE = "2026-05-13";

const paragraph: React.CSSProperties = {
  margin: "0 0 var(--space-4)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--type-16)",
  lineHeight: "var(--leading-relaxed)",
  color: "var(--text)",
};

const subhead: React.CSSProperties = {
  margin: "var(--space-6) 0 var(--space-3)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-14)",
  letterSpacing: "0.06em",
  color: "var(--text)",
  textTransform: "uppercase",
  fontWeight: 400,
};

const subheadFirst: React.CSSProperties = {
  ...subhead,
  marginTop: "var(--space-3)",
};

const codeBlock: React.CSSProperties = {
  display: "block",
  margin: "var(--space-3) 0 var(--space-4)",
  padding: "var(--space-3) var(--space-4)",
  border: "1px solid var(--rule)",
  background: "var(--surface-1)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-12)",
  lineHeight: 1.55,
  color: "var(--text)",
  overflowX: "auto",
  whiteSpace: "pre",
};

const inlineCode: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.92em",
  color: "var(--text)",
};

const accentLink: React.CSSProperties = {
  color: "var(--accent)",
};

const bodyLink: React.CSSProperties = {
  color: "var(--text)",
  textDecoration: "underline",
  textDecorationColor: "var(--rule-strong)",
  textUnderlineOffset: "3px",
};

const figureCaption: React.CSSProperties = {
  margin: "calc(-1 * var(--space-3)) 0 var(--space-5)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--type-12)",
  color: "var(--text-mute)",
  letterSpacing: "0.04em",
};

export default function WhitepaperPage() {
  return (
    <div>
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "baseline",
          gap: "var(--space-4)",
          padding: "var(--space-5) 0 var(--space-3)",
          borderBottom: "1px solid var(--rule-strong)",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-12)",
              color: "var(--text-mute)",
              letterSpacing: "0.08em",
            }}
          >
            0GZK · TECHNICAL WHITEPAPER
          </p>
          <h1
            style={{
              margin: "var(--space-2) 0 var(--space-2)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-32)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--text)",
              maxWidth: "30ch",
            }}
          >
            A 0G-native name registry for client-side ZK proving.
          </h1>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--type-12)",
            color: "var(--text-mute)",
            letterSpacing: "0.06em",
            textAlign: "right",
            lineHeight: 1.7,
          }}
        >
          <div>{VERSION}</div>
          <div>{REVISION_DATE}</div>
          <div>0gzk contributors</div>
        </div>
      </header>

      <Block title="ABSTRACT" index="§ 00">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <p style={paragraph}>
            Zero-knowledge circuits are useful only insofar as a relying party
            can be sure that (a) it has the right circuit, (b) the proving and
            verifying keys it is using were generated honestly from that
            circuit, and (c) the prover did not have to surrender its private
            inputs to anyone in order to participate. In practice today these
            three properties are usually re-established ad hoc, per
            application: an SDK ships a hardcoded WASM blob, a backend offers
            a hosted prover, a verifier contract is deployed by hand and
            referenced by an off-chain config file. The result is a tightly
            coupled, deploy-time trust relationship between the circuit
            author, the application developer, and the end user.
          </p>
          <p style={paragraph}>
            This document describes <strong>0gzk</strong>, a set of primitives
            built natively on the{" "}
            <a href="https://docs.0g.ai" style={accentLink} target="_blank" rel="noopener noreferrer">
              0G stack
            </a>{" "}
            that decouples those three roles. The design relies on 0G
            providing two complementary substrates under one trust domain:{" "}
            <a href="https://docs.0g.ai/0g-storage" style={accentLink} target="_blank" rel="noopener noreferrer">
              0G Storage
            </a>
            , a content-addressed, merkle-rooted object store, and{" "}
            <a href="https://docs.0g.ai/0g-chain" style={accentLink} target="_blank" rel="noopener noreferrer">
              0G Chain
            </a>
            , an EVM-compatible execution layer that can natively reference
            those storage roots. A circuit author publishes a self-describing{" "}
            <em>circuit bundle</em> (WASM + zkey + verifying key + metadata)
            once on 0G Storage and registers it on 0G Chain under a globally
            unique <code style={inlineCode}>name@version</code>. An
            application developer integrates by name, not by hash; the
            mapping from name to bytes is governed entirely by an immutable
            on-chain record. An end user runs Groth16 proving on-device — in
            the browser, in Node, or on a backend they control — and the
            secret witness never crosses a network boundary. Verification
            can be done locally against the same key the contract uses, or
            on-chain by calling the registered Solidity verifier.
          </p>
          <p style={paragraph}>
            We describe the 0G-native data model, the on-chain registry
            contract, the resolution and proving protocol, the threat model
            under which those properties hold, and the v0.3 reference
            implementation currently deployed at{" "}
            <a
              href={`https://explorer.0g.ai/mainnet/blockchain/accounts/${REGISTRY_ADDRESS}/transactions`}
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {REGISTRY_ADDRESS}
            </a>{" "}
            on 0G mainnet. We close with the open work — most notably a
            multi-party Phase&nbsp;2 ceremony — required before this scheme
            can be considered production-grade for high-value verification.
          </p>

          <h2 style={subhead}>Deployments</h2>
          <Row
            label="MAINNET"
            value={
              <a
                href={`https://chainscan.0g.ai/address/${REGISTRY_ADDRESS}`}
                style={bodyLink}
                target="_blank"
                rel="noopener noreferrer"
                title={REGISTRY_ADDRESS}
              >
                <code style={inlineCode}>{REGISTRY_ADDRESS}</code>
              </a>
            }
            unit="chain id 16661"
          />
          <Row
            label="TESTNET"
            value={
              <a
                href={`https://chainscan-galileo.0g.ai/address/${TESTNET_REGISTRY_ADDRESS}`}
                style={bodyLink}
                target="_blank"
                rel="noopener noreferrer"
                title={TESTNET_REGISTRY_ADDRESS}
              >
                <code style={inlineCode}>{TESTNET_REGISTRY_ADDRESS}</code>
              </a>
            }
            unit="chain id 16602 (Galileo)"
          />
        </div>
      </Block>

      <Block title="INTRODUCTION" index="§ 01">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <h2 style={subheadFirst}>1.1 The integration problem</h2>
          <p style={paragraph}>
            Building a Groth16-based zero-knowledge feature today
            (an age check, a Merkle membership proof, a private balance
            attestation, an off-chain computation receipt) requires a developer
            to make three decisions that are rarely written down:
          </p>
          <p style={paragraph}>
            <strong>Which bytes?</strong> The compiled <code style={inlineCode}>.wasm</code>{" "}
            and the proving key <code style={inlineCode}>.zkey</code> are
            usually shipped inside the application bundle, downloaded from a
            CDN, or pinned to IPFS. None of these distribution channels are
            authenticated by the verifier contract on chain. A user has to
            trust that the application is shipping the same circuit whose
            verifier address was deployed.
          </p>
          <p style={paragraph}>
            <strong>Which key?</strong> The verifying key in the bundle and
            the verifying key compiled into the on-chain Solidity verifier
            must agree exactly, byte for byte after canonicalization, or every
            proof will silently fail to verify. There is no convention for
            asserting this equivalence on chain.
          </p>
          <p style={paragraph}>
            <strong>Where does the witness go?</strong> Many ZK-as-a-service
            offerings solve the previous two problems by hosting a prover.
            That solution defeats the privacy guarantee of zero knowledge: the
            user's secret inputs are now sitting, plaintext, on someone
            else's machine. A correct architecture has to keep proving
            client-side without making distribution and key-management the
            developer's problem.
          </p>

          <h2 style={subhead}>1.2 Why 0G</h2>
          <p style={paragraph}>
            The same protocol could, in principle, be sketched on top of any
            content-addressed storage layer plus any EVM chain. We chose to
            build it on 0G — and to publish it as a 0G-native protocol — for
            three concrete reasons.
          </p>
          <p style={paragraph}>
            <strong>One trust domain.</strong> The bundle (on 0G Storage) and
            the registry record (on 0G Chain) live under the same consensus
            and the same set of operators. A relying party that already
            trusts 0G's chain to serve the registry record does not have to
            additionally trust a separately-governed pinning service to
            still be serving the bundle hours, days, or years later. Bundle
            durability and registry correctness fail or recover together.
          </p>
          <p style={paragraph}>
            <strong>Native merkle addressing, not advisory.</strong> A 0G
            Storage <code style={inlineCode}>rootHash</code> is the same
            32-byte merkle root that the storage log entry on 0G Chain was
            anchored against. We can store it directly as a{" "}
            <code style={inlineCode}>bytes32</code> in the registry — no
            CID-string parsing, no off-chain mapping, no separate
            availability oracle. It is the same primitive on both sides.
          </p>
          <p style={paragraph}>
            <strong>EVM where the verifier already lives.</strong> The
            output of <code style={inlineCode}>snarkjs</code>'s Solidity
            verifier template runs as-is on 0G Chain. No transpilation, no
            recursion bridge, no second proof system. The registry, the
            verifier, and the application contract that consumes the verdict
            are all addressable from the same RPC.
          </p>

          <h2 style={subhead}>1.3 Contributions</h2>
          <p style={paragraph}>
            Given that substrate, 0gzk is three tightly coupled artifacts:
          </p>
          <p style={paragraph}>
            (i) A canonical <strong>circuit bundle</strong> format —
            tar+gzip of <code style={inlineCode}>circuit.wasm</code>,{" "}
            <code style={inlineCode}>circuit_final.zkey</code>,{" "}
            <code style={inlineCode}>verification_key.json</code>, an optional{" "}
            <code style={inlineCode}>verifier.sol</code>, and a structured{" "}
            <code style={inlineCode}>metadata.json</code> — uploaded to 0G
            Storage and addressed by its merkle <em>rootHash</em>. The bundle
            is self-describing: a consumer who has only the rootHash can
            reconstruct everything needed to prove and verify.
          </p>
          <p style={paragraph}>
            (ii) An on-chain <strong>name registry</strong> on 0G Chain
            (<code style={inlineCode}>CircuitRegistry.sol</code>) that maps a
            human-readable <code style={inlineCode}>name@version</code> to a
            tuple <code style={inlineCode}>(rootHash, vkeyHash, verifier, publisher, publishedAt, metadataURI)</code>.
            Names are claimed first-come-first-served and owned by an EOA;
            published versions are immutable. The registry holds no funds and
            performs no signature verification — it is a pure index.
          </p>
          <p style={paragraph}>
            (iii) An isomorphic <strong>SDK + CLI</strong> that resolves a
            name against the 0G Chain registry, fetches the bundle from 0G
            Storage, verifies <code style={inlineCode}>vkeyHash</code>{" "}
            equality on arrival, and runs{" "}
            <code style={inlineCode}>snarkjs.groth16.fullProve</code>{" "}
            client-side. The same library powers a published prover at{" "}
            <Link href="/" style={bodyLink}>
              this site
            </Link>
            , a Node CLI (<code style={inlineCode}>npm i -g @0gzk/cli</code>),
            and a programmatic API (<code style={inlineCode}>npm i @0gzk/sdk</code>).
          </p>

          <h2 style={subhead}>1.4 Non-goals</h2>
          <p style={paragraph}>
            0gzk is intentionally not a proof aggregator, not a hosted prover,
            not a circuit DSL, not a new proving system, and not a token.
            Anything that would force the registry to take custody of value or
            require off-chain consensus is out of scope for v0.2. We address
            two of the most common follow-up questions — multi-party trusted
            setup and human-readable name disputes — in §&nbsp;08.
          </p>
        </div>
      </Block>

      <Block title="BACKGROUND" index="§ 02">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <h2 style={subheadFirst}>2.1 Groth16, briefly</h2>
          <p style={paragraph}>
            Groth16{" "}
            <a href="#ref-groth16" style={bodyLink}>
              [Gro16]
            </a>{" "}
            is a pre-processing zk-SNARK over pairing-friendly elliptic
            curves, in our case alt_bn128 (BN254). For a circuit{" "}
            <code style={inlineCode}>C</code> compiled from a rank-1
            constraint system, a Groth16 setup produces a proving key{" "}
            <code style={inlineCode}>pk</code> and a verifying key{" "}
            <code style={inlineCode}>vk</code>. Given private inputs{" "}
            <code style={inlineCode}>w</code> and public inputs{" "}
            <code style={inlineCode}>x</code> with{" "}
            <code style={inlineCode}>C(x, w) = 1</code>, the prover produces a
            three-element proof <code style={inlineCode}>π</code> in roughly
            constant size (~200 bytes); a verifier checks{" "}
            <code style={inlineCode}>Verify(vk, x, π) = 1</code> in roughly
            constant time, and on-chain in approximately 200&nbsp;000 gas using
            the snarkjs Solidity template{" "}
            <a href="#ref-snarkjs" style={bodyLink}>
              [SnJS]
            </a>
            . The trusted-setup requirement decomposes into a universal
            Phase&nbsp;1 (Powers of Tau) and a circuit-specific Phase&nbsp;2.
          </p>

          <h2 style={subhead}>2.2 Trusted setup</h2>
          <p style={paragraph}>
            We reuse the public Hermez Phase&nbsp;1 transcript{" "}
            <a href="#ref-hermez" style={bodyLink}>
              [Her22]
            </a>
            , a 28-power Powers of Tau ceremony with several dozen
            independent contributors. The SDK pins each Phase&nbsp;1 file by
            its BLAKE2b-512 digest and refuses to use a corrupted copy. The
            Phase&nbsp;2 transcript is, in v0.2, generated by the publisher
            in a single pass; we discuss the security implications and the
            planned mitigation in §&nbsp;06 and §&nbsp;08.
          </p>

          <h2 style={subhead}>2.3 The 0G stack</h2>
          <p style={paragraph}>
            0G{" "}
            <a href="#ref-zg" style={bodyLink}>
              [0G24]
            </a>{" "}
            is a modular L1 with two facets that this protocol relies on
            jointly.
          </p>
          <p style={paragraph}>
            <strong>0G Storage</strong> is the data-availability and storage
            layer. Each upload is chunked, padded to fixed-size segments,
            and committed under a binary merkle root. The on-chain log entry
            on the storage contract binds that merkle root to a byte length
            and a <code style={inlineCode}>startEntryIndex</code>; segments
            are then served by storage nodes addressed through an indexer.
            We treat the 32-byte rootHash as the canonical identifier for a
            bundle: any downloader who reassembles the segments and
            recomputes the merkle root can detect tampering without trusting
            the indexer, and the same rootHash is referenceable as a literal{" "}
            <code style={inlineCode}>bytes32</code> from any contract on 0G
            Chain.
          </p>
          <p style={paragraph}>
            <strong>0G Chain</strong> is the EVM-compatible execution layer
            (chain id 16661 on mainnet; 16602 on the Galileo testnet) on
            which the registry contract and every per-circuit Solidity
            verifier are deployed. Because both surfaces — registry record
            and verifier — live on the same chain as one another, a single
            RPC round-trip resolves a{" "}
            <code style={inlineCode}>name@version</code> to (a) the bundle
            to download from 0G Storage and (b) the address to call for
            on-chain verification. There is no cross-domain bridge in the
            critical path.
          </p>
        </div>
      </Block>

      <Block title="SYSTEM OVERVIEW" index="§ 03">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <p style={paragraph}>
            The system has three actors and two co-located data planes on
            the 0G stack. Actors: <strong>publisher</strong> (compiles, runs
            setup, uploads to 0G Storage, registers on 0G Chain),{" "}
            <strong>relying party</strong> (an application or contract that
            wants a particular circuit by name), and{" "}
            <strong>prover</strong> (the end user with the secret input).
            Data planes: <strong>0G Storage</strong> holds the bundles
            addressed by rootHash; <strong>0G Chain</strong> holds the
            registry contract and the per-circuit Groth16 verifier
            contracts, both addressable by EVM address. Crucially, both
            planes are anchored to the same consensus, so the registry can
            reference storage roots as native{" "}
            <code style={inlineCode}>bytes32</code> values rather than as
            opaque external pointers.
          </p>

          <pre style={codeBlock}>{`                              ┌──────────────────┐
                              │   PUBLISHER      │
                              │ circom + snarkjs │
                              └────────┬─────────┘
                                       │ build
                                       ▼
                          tar.gz(circuit_bundle)
                                       │
                          upload  │  deploy verifier.sol
                  ┌─────────────────┴──────────────────┐
                  ▼                                    ▼
        ┌──────────────────┐                ┌─────────────────────┐
        │   0G STORAGE     │                │   0G CHAIN          │
        │ rootHash ↔ bytes │                │ Verifier.sol  + ... │
        └────────┬─────────┘                │ CircuitRegistry.sol │
                 │                          └──────────┬──────────┘
                 │              publishVersion(name@v, │
                 │              rootHash, vkeyHash, …) │
                 │                                     │
                 │                resolveName(name@v) ◀┘
                 │                  ┌──────────────────┐
                 ▼                  │  RELYING PARTY   │
        fetch(rootHash) ──────────▶ │  (web app, etc.) │
                                    └────────┬─────────┘
                                             │ delivers bundle
                                             ▼
                                    ┌──────────────────┐
                                    │     PROVER       │
                                    │  groth16.prove   │
                                    │  (witness, w)    │
                                    └────────┬─────────┘
                                             │ π, x
                                             ▼
                                    Verify(vk, π, x)
                                    [local or on-chain]`}</pre>
          <p style={figureCaption}>
            Figure 1. End-to-end flow. The witness <code style={inlineCode}>w</code>{" "}
            never leaves the prover.
          </p>

          <h2 style={subhead}>3.1 The bundle</h2>
          <p style={paragraph}>
            A bundle is a deterministic tar+gzip archive containing exactly
            five entries:
          </p>
          <pre style={codeBlock}>{`circuit_bundle/
├── circuit.wasm                  // WASM witness generator from circom
├── circuit_final.zkey            // proving key after Phase 2
├── verification_key.json         // verifying key (snarkjs export)
├── verifier.sol                  // Solidity Groth16 verifier (optional)
└── metadata.json                 // typed input/output schema, semver, etc.`}</pre>
          <p style={paragraph}>
            <code style={inlineCode}>metadata.json</code> declares the
            circuit name, semver-compatible version, proof system{" "}
            (<code style={inlineCode}>"groth16"</code>), curve{" "}
            (<code style={inlineCode}>"bn128"</code>), and the typed input and
            output signals (each marked as public or private with an
            optional length for arrays). The CLI and SDK use this schema to
            (a) reject witnesses that violate type or visibility before
            calling snarkjs and (b) render input forms in surfaces such as
            the web prover.
          </p>
        </div>
      </Block>

      <Block title="PROTOCOL" index="§ 04">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <h2 style={subheadFirst}>4.1 Notation</h2>
          <p style={paragraph}>
            Let <code style={inlineCode}>H_m</code> denote 0G Storage merkle
            hashing, <code style={inlineCode}>H_k</code> denote{" "}
            <code style={inlineCode}>keccak256</code>,{" "}
            <code style={inlineCode}>canon(·)</code> the canonical JSON
            encoding (RFC 8785-style: keys sorted lexicographically, no
            insignificant whitespace), and <code style={inlineCode}>‖</code>{" "}
            byte concatenation. A bundle B = (wasm, zkey, vk, metadata,
            verifier?) has{" "}
            <code style={inlineCode}>rootHash(B) = H_m(tar.gz(B))</code> and{" "}
            <code style={inlineCode}>vkeyHash(B) = H_k(canon(vk))</code>.
          </p>

          <h2 style={subhead}>4.2 Build</h2>
          <pre style={codeBlock}>{`Inputs:  circuit.circom
Output:  bundle B with (wasm, zkey, vk, verifier.sol, metadata)

1. r1cs, wasm  ← circom(circuit.circom)
2. ptau        ← fetchPowersOfTau(size)        // BLAKE2b-checked
3. zkey₀       ← snarkjs.zKey.newZKey(r1cs, ptau)
4. zkey        ← snarkjs.zKey.contribute(zkey₀, entropy)
5. vk          ← snarkjs.zKey.exportVerificationKey(zkey)
6. verifier    ← snarkjs.zKey.exportSolidityVerifier(zkey)
7. B           ← assembleBundle(wasm, zkey, vk, verifier, metadata)`}</pre>

          <h2 style={subhead}>4.3 Publish</h2>
          <pre style={codeBlock}>{`Inputs:  bundle B, name n, version v, signer sk
On-chain:  CircuitRegistry at address R

1. tarball     ← tar.gz(B)
2. rootHash    ← upload(tarball)              // 0G Storage
3. address(V)  ← deploy(B.verifier)            // 0G Chain
4. tx          ← R.publishVersion(
                    n, v,
                    rootHash,
                    vkeyHash(B),
                    address(V),
                    metadataURI)
5. await tx                                    // immutable from here on`}</pre>
          <p style={paragraph}>
            All six post-publish fields are frozen by the contract; only{" "}
            <code style={inlineCode}>verifier</code> may later be patched by
            the circuit owner via <code style={inlineCode}>setVerifier</code>{" "}
            (e.g. to fix a deploy-time bug in the verifier without
            re-publishing the bundle).
          </p>

          <h2 style={subhead}>4.4 Resolve and prove</h2>
          <pre style={codeBlock}>{`Inputs:  name@version (n@v), witness w, public x, registry R

1. record       ← R.getVersion(n, v)           // or getLatest(n)
2. tarball      ← fetch(record.rootHash)       // 0G Storage
3. B            ← gunzip+untar(tarball)
4. assert vkeyHash(B) == record.vkeyHash       // canonical comparison
5. (π, x')      ← snarkjs.groth16.fullProve(w ∪ x, B.wasm, B.zkey)
6. assert x' ⊇ x                                // declared publics match
7. ok_local     ← snarkjs.groth16.verify(B.vk, x', π)
8. ok_chain     ← IGroth16Verifier(record.verifier).verifyProof(π, x')`}</pre>
          <p style={paragraph}>
            Step 4 is what makes the registry a real binding: a malicious
            indexer can return any bundle it wants, but it cannot return one
            whose canonical verifying key hashes to the on-chain commitment.
            Steps 7 and 8 are equivalent in the cryptographic sense; a
            relying party may use either or both depending on whether it is
            making an off-chain or on-chain decision.
          </p>
        </div>
      </Block>

      <Block title="ON-CHAIN REGISTRY" index="§ 05">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <p style={paragraph}>
            The full registry contract is{" "}
            <a
              href="https://github.com/0gzk/core/blob/main/packages/contracts/src/CircuitRegistry.sol"
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              CircuitRegistry.sol
            </a>
            . Its core types are:
          </p>
          <pre style={codeBlock}>{`struct Version {
    bytes32 rootHash;       // 0G Storage merkle root of the bundle
    bytes32 vkeyHash;       // keccak256(canonical(verification_key.json))
    address verifier;       // deployed Groth16 verifier (may be patched)
    address publisher;      // EOA that called publishVersion
    uint64  publishedAt;    // block.timestamp at publish
    string  metadataURI;    // off-chain pointer (e.g. 0gzk://name@version)
}

mapping(string => Circuit) circuits;
struct Circuit {
    bool      exists;
    address   owner;        // first caller of createCircuit(name)
    string[]  versionList;
    mapping(string => Version) versions;
}`}</pre>
          <p style={paragraph}>
            Names are restricted to{" "}
            <code style={inlineCode}>^[a-z0-9_-]{"{2,32}"}$</code>; versions
            to <code style={inlineCode}>^[a-zA-Z0-9._-]{"{1,32}"}$</code>.
            <code style={inlineCode}> publishVersion</code> is rejected if any
            of <code style={inlineCode}>rootHash</code>,{" "}
            <code style={inlineCode}>vkeyHash</code> are zero, if the version
            has already been published, or if the caller is not the circuit
            owner. <code style={inlineCode}>setVerifier</code> is the only
            mutable post-publish operation; ownership can be transferred via{" "}
            <code style={inlineCode}>transferOwner</code>. There is no
            governance, no upgrade proxy, no admin role.
          </p>

          <h2 style={subhead}>5.1 Cost and gas</h2>
          <p style={paragraph}>
            A typical publish sequence is{" "}
            <code style={inlineCode}>createCircuit</code> (~70k gas) +{" "}
            <code style={inlineCode}>publishVersion</code> (~120k gas) +
            verifier deployment (~600k gas, dominated by the snarkjs
            template). The verifier deployment is by far the largest
            contributor and is independent of the circuit's constraint
            count.
          </p>

          <h2 style={subhead}>5.2 Indexing</h2>
          <p style={paragraph}>
            The contract exposes three browse views —{" "}
            <code style={inlineCode}>listCircuits(offset, limit)</code>,{" "}
            <code style={inlineCode}>listVersions(name)</code>, and{" "}
            <code style={inlineCode}>getLatest(name)</code> — which are
            sufficient to power the home page, CLI{" "}
            <code style={inlineCode}>0gzk registry list</code>, and any
            downstream subgraph without an additional indexer service.
            Strings are stored as raw <code style={inlineCode}>string</code>{" "}
            (not bytes32) to keep the API human-friendly; this is acceptable
            because reads are off-chain and writes are rare.
          </p>
        </div>
      </Block>

      <Block title="THREAT MODEL" index="§ 06">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <p style={paragraph}>
            We enumerate the parties and what each must (and must not) be
            trusted for.
          </p>

          <h2 style={subheadFirst}>6.1 What we trust</h2>
          <p style={paragraph}>
            <strong>The 0G Chain consensus.</strong> The registry is a
            standard Solidity contract; its safety reduces to the safety of
            the underlying chain. An adversary that can rewrite chain history
            can rewrite circuit registrations.
          </p>
          <p style={paragraph}>
            <strong>0G Storage availability.</strong> If no honest storage
            node serves the segments backing a rootHash, provers cannot fetch
            the bundle. Soundness is unaffected — a bundle returned by any
            party is checked against the registered{" "}
            <code style={inlineCode}>vkeyHash</code> and against its own
            recomputed merkle root — but liveness degrades.
          </p>
          <p style={paragraph}>
            <strong>The Phase&nbsp;1 ceremony.</strong> We rely on at least
            one honest contributor in the Hermez Powers-of-Tau transcript.
            This is a standard, conservative assumption inherited from the
            broader Groth16 ecosystem.
          </p>
          <p style={paragraph}>
            <strong>The publisher, for Phase&nbsp;2 only (v0.2).</strong> A
            single publisher generating the circuit-specific zkey can, in
            principle, derive the toxic waste and forge proofs for that
            circuit. This is the largest open assumption in v0.2 and is
            addressed in §&nbsp;08.
          </p>

          <h2 style={subhead}>6.2 What we explicitly do not trust</h2>
          <p style={paragraph}>
            <strong>The 0G Storage indexer.</strong> An indexer that returns
            arbitrary bytes for a given <code style={inlineCode}>rootHash</code>{" "}
            is detected at step&nbsp;3 of §&nbsp;4.4 (merkle reassembly) and
            again at step&nbsp;4 (vkeyHash). The worst it can do is refuse to
            serve.
          </p>
          <p style={paragraph}>
            <strong>The application developer integrating by name.</strong>{" "}
            The developer chooses the name they want to use, but the
            mapping from <code style={inlineCode}>name@version</code> to
            bytes is enforced by the registry, not by the developer's CDN
            or build pipeline. A user who suspects substitution can resolve
            the same name from a fresh RPC and confirm the same record.
          </p>
          <p style={paragraph}>
            <strong>The web prover hosted at this domain.</strong> This site
            is a convenience surface. The exact same proof could be produced
            by <code style={inlineCode}>@0gzk/cli</code> on the user's own
            machine, byte-for-byte, against the same{" "}
            <code style={inlineCode}>name@version</code>.
          </p>

          <h2 style={subhead}>6.3 Witness confidentiality</h2>
          <p style={paragraph}>
            The protocol is designed so that the only place the witness ever
            exists in cleartext is the prover's process memory. The bundle
            is fetched as ciphertext-equivalent (it is public anyway), the
            registry call is read-only, and the proof + public signals
            published downstream reveal only what the circuit was designed to
            reveal. The web prover, in particular, runs entirely in the
            user's tab; the deployed code is open source and reproducible
            from the linked commit.
          </p>
        </div>
      </Block>

      <Block title="IMPLEMENTATION" index="§ 07">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <p style={paragraph}>
            The reference implementation is a TypeScript monorepo. Three
            published packages:
          </p>
          <p style={paragraph}>
            <strong>
              <code style={inlineCode}>@0gzk/sdk</code>
            </strong>{" "}
            — isomorphic prover and verifier, plus the Node-only build
            pipeline (<code style={inlineCode}>@0gzk/sdk/build</code>) and
            on-chain helpers (<code style={inlineCode}>@0gzk/sdk/onchain</code>).
            All cryptographic operations delegate to{" "}
            <a href="#ref-snarkjs" style={bodyLink}>
              snarkjs
            </a>
            ; the SDK is a thin, type-safe orchestration layer that adds the
            metadata schema, registry resolution, and bundle assembly. See{" "}
            <a
              href="https://github.com/0gzk/core/blob/main/packages/sdk/USAGE.md"
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              USAGE.md
            </a>
            .
          </p>
          <p style={paragraph}>
            <strong>
              <code style={inlineCode}>@0gzk/cli</code>
            </strong>{" "}
            — <code style={inlineCode}>0gzk publish</code>,{" "}
            <code style={inlineCode}>0gzk prove</code>,{" "}
            <code style={inlineCode}>0gzk registry list/get/resolve</code>,
            and a recovery flow (<code style={inlineCode}>0gzk registry register</code>)
            that re-attempts on-chain registration when an upload finalizes
            after a CLI timeout. Built on commander + the SDK, no other
            runtime dependencies.
          </p>
          <p style={paragraph}>
            <strong>
              <code style={inlineCode}>CircuitRegistry.sol</code>
            </strong>{" "}
            — Foundry-built, deployed at{" "}
            <a
              href={`https://chainscan.0g.ai/address/${REGISTRY_ADDRESS}`}
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {REGISTRY_ADDRESS}
            </a>{" "}
            on {CHAIN_NAME}. A development deployment is also live on{" "}
            {TESTNET_CHAIN_NAME} at{" "}
            <a
              href={`https://chainscan-galileo.0g.ai/address/${TESTNET_REGISTRY_ADDRESS}`}
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {TESTNET_REGISTRY_ADDRESS}
            </a>{" "}
            (opt in with <code style={inlineCode}>OG_NETWORK=testnet</code>).
            Source and <code style={inlineCode}>forge test</code> suite
            under{" "}
            <a
              href="https://github.com/0gzk/core/tree/main/packages/contracts"
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              packages/contracts/
            </a>
            .
          </p>

          <h2 style={subhead}>7.1 Reference circuits</h2>
          <p style={paragraph}>
            Five circuits are published to the live registry as integration
            tests and as worked examples:
          </p>
          <pre style={codeBlock}>{`age_verification           proves currentYear − birthYear ≥ minAge
poseidon_preimage          proves knowledge of x s.t. Poseidon(x) = h
merkle_membership          depth-8 Poseidon Merkle inclusion proof
private_balance_threshold  proves balance ≥ threshold without revealing it
private_multiply           proves knowledge of (a, b) s.t. a · b = c`}</pre>
          <p style={paragraph}>
            Each ships under{" "}
            <a
              href="https://github.com/0gzk/core/tree/main/circuits"
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              circuits/
            </a>{" "}
            with its own{" "}
            <code style={inlineCode}>build.sh</code> and a corresponding
            registered name on the live registry. The five examples under{" "}
            <a
              href="https://github.com/0gzk/core/tree/main/examples"
              style={bodyLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              examples/
            </a>{" "}
            cover Node proving, browser proving, on-chain verification,
            resolution by name, and end-to-end publishing of a new circuit.
          </p>
        </div>
      </Block>

      <Block title="LIMITATIONS AND FUTURE WORK" index="§ 08">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <h2 style={subheadFirst}>8.1 Single-party Phase 2 (open)</h2>
          <p style={paragraph}>
            v0.2 generates the circuit-specific zkey in a single contribution
            by the publisher. This is unsuitable for circuits whose verifier
            will gate value transfer or other adversarial decisions. v0.3
            will introduce an on-chain coordinator for{" "}
            <em>distributed Phase&nbsp;2 ceremonies</em>: the publisher
            commits to an initial transcript, N independent contributors
            append entropy in any order with proofs of correctness, and the
            registry records the final transcript hash alongside the
            published version. We will not consider 0gzk production-ready for
            high-value verification until this lands.
          </p>

          <h2 style={subhead}>8.2 Naming disputes (deferred)</h2>
          <p style={paragraph}>
            Names are first-come-first-served with no dispute mechanism.
            This is a deliberate choice for v0.2: arbitration cannot be done
            on chain without introducing trust we have so far avoided.
            Applications that require trademark-grade naming should pin by{" "}
            <code style={inlineCode}>publisher</code> address as well as
            name, or use ENS-style namespacing layered above the registry.
          </p>

          <h2 style={subhead}>8.3 Cross-chain verification (planned)</h2>
          <p style={paragraph}>
            A verifier deployed on 0G Chain cannot, by itself, be called
            from Ethereum L1 or another L2. Two complementary directions are
            on the roadmap: (a) a thin <em>verifier-relay</em> standard that
            redeploys the same Solidity verifier under the same source on
            arbitrary EVM chains and registers each address, and (b)
            recursive proof composition so that a 0G-side verification can
            be re-proved as an L1 statement.
          </p>

          <h2 style={subhead}>8.4 Other proof systems</h2>
          <p style={paragraph}>
            The schema is keyed by <code style={inlineCode}>protocol</code>{" "}
            and <code style={inlineCode}>curve</code> exactly so that Plonk
            and HyperPlonk variants can land without breaking changes. The
            registry contract is already proof-system-agnostic (it stores
            opaque hashes); the SDK and CLI need wiring.
          </p>
        </div>
      </Block>

      <Block title="REFERENCES" index="§ 09">
        <div style={{ paddingTop: "var(--space-3)" }}>
          <Row
            label="[Gro16]"
            value={
              <span id="ref-groth16">
                Jens Groth.{" "}
                <em>On the Size of Pairing-Based Non-interactive Arguments.</em>{" "}
                EUROCRYPT 2016. ePrint{" "}
                <a
                  href="https://eprint.iacr.org/2016/260"
                  style={bodyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  2016/260
                </a>
                .
              </span>
            }
          />
          <Row
            label="[SnJS]"
            value={
              <span id="ref-snarkjs">
                iden3.{" "}
                <em>snarkjs — JavaScript implementation of zkSNARK schemes.</em>{" "}
                <a
                  href="https://github.com/iden3/snarkjs"
                  style={bodyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/iden3/snarkjs
                </a>
                .
              </span>
            }
          />
          <Row
            label="[Her22]"
            value={
              <span id="ref-hermez">
                Polygon Hermez.{" "}
                <em>Powers of Tau ceremony — 28 powers, BN254.</em>{" "}
                <a
                  href="https://github.com/iden3/snarkjs#7-prepare-phase-2"
                  style={bodyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  iden3/snarkjs §7
                </a>
                .
              </span>
            }
          />
          <Row
            label="[0G24]"
            value={
              <span id="ref-zg">
                0G Foundation.{" "}
                <em>0G Storage, 0G Chain, and 0G DA documentation.</em>{" "}
                <a
                  href="https://docs.0g.ai"
                  style={bodyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  docs.0g.ai
                </a>
                .
              </span>
            }
          />

          <div
            style={{
              marginTop: "var(--space-7)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--rule)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--type-12)",
              color: "var(--text-mute)",
              letterSpacing: "0.04em",
            }}
          >
            Source for this document, the contracts, the SDK, and the
            reference circuits is at{" "}
            <a
              href="https://github.com/0gzk/core"
              style={accentLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/0gzk/core
            </a>
            . Errata, corrections, and discussion welcome on the issue
            tracker.
          </div>
        </div>
      </Block>
    </div>
  );
}
