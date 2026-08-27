import { Block, Row } from "./SpecSheet";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileList({
  sizes,
  vkeyBytes,
  index = "§ 03",
}: {
  sizes: { wasm: number; zkey: number };
  vkeyBytes: number;
  index?: string;
}) {
  return (
    <Block title="ARTIFACTS" index={index}>
      <Row label="circuit.wasm" value={fmtBytes(sizes.wasm)} unit="binary" delayIndex={0} />
      <Row label="circuit_final.zkey" value={fmtBytes(sizes.zkey)} unit="binary" delayIndex={1} />
      <Row label="verification_key.json" value={fmtBytes(vkeyBytes)} unit="json" delayIndex={2} />
    </Block>
  );
}
