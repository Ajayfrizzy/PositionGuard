import { previewPolicy } from "@/lib/aave/analysis";
import { chains, getDefaultChain } from "@/lib/chains/config";
import { AaveVerifier } from "./verifier";
export default function AaveDevelopmentPage() {
  const defaultChain = getDefaultChain();
  const networks = Object.values(chains).map(({ chainId, name, testnet }) => ({
    chainId,
    name,
    testnet,
  }));
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Aave position verification</h1>
      <p className="mt-3 text-slate-400">
        Read-only development analysis. Enter a public wallet address. No wallet signature or
        transaction is requested.
      </p>
      <AaveVerifier
        policy={previewPolicy}
        defaultChainId={defaultChain.chainId}
        networks={networks}
      />
    </main>
  );
}
