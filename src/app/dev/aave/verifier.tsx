"use client";
import { useState } from "react";
import type { ProtectionPolicy } from "@/lib/policies/types";
import type { AavePosition } from "@/lib/aave/types";
import type { PositionAnalysis } from "@/lib/aave/analysis";
type Result = { position: AavePosition; analysis: PositionAnalysis; snapshotId: string | null };
type Network = { chainId: number; name: string; testnet: boolean };
const financialFields = [
  ["targetHealthFactor", "Target HF"],
  ["warningHealthFactor", "Warning HF"],
  ["emergencyHealthFactor", "Emergency HF"],
  ["maxAutonomousAmountUsd", "Per-action cap USD"],
  ["maxDailyAutonomousAmountUsd", "Daily cap USD"],
  ["approvalRequiredAboveUsd", "Approval above USD"],
] as const;
export function AaveVerifier({
  policy: initial,
  defaultChainId,
  networks,
}: {
  policy: ProtectionPolicy;
  defaultChainId: number;
  networks: Network[];
}) {
  const [chainId, setChainId] = useState(defaultChainId);
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [policy, setPolicy] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedNetwork = networks.find((network) => network.chainId === chainId)!;
  async function evaluate(save: boolean) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      // GET is a no-persistence preview using server defaults; POST deliberately evaluates the edited policy and saves.
      const response = await fetch(
        save
          ? "/api/positions/aave"
          : `/api/positions/aave?${new URLSearchParams({ address, chainId: String(chainId) })}`,
        {
          method: save ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(save ? { "Content-Type": "application/json" } : {}),
          },
          ...(save ? { body: JSON.stringify({ address, chainId, policy }) } : {}),
          signal: AbortSignal.timeout(60_000),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? data.error?.code ?? "Read failed");
      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Read failed");
    } finally {
      setBusy(false);
    }
  }
  const inputStyle = "mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2";
  return (
    <>
      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void evaluate(false);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            Network
            <select
              className={inputStyle}
              value={chainId}
              onChange={(e) => {
                setChainId(Number(e.target.value));
                setResult(null);
                setError("");
              }}
            >
              {networks.map((network) => (
                <option key={network.chainId} value={network.chainId}>
                  {network.name}
                </option>
              ))}
            </select>
          </label>
          <div className="min-w-44 border-l-4 border-amber-400 bg-amber-950/40 px-4 py-3">
            <p className="font-medium">{selectedNetwork.name}</p>
            <p className="text-sm text-amber-200">
              Chain ID: {selectedNetwork.chainId}
              {selectedNetwork.testnet ? " · TESTNET" : " · MAINNET"}
            </p>
          </div>
        </div>
        {selectedNetwork.testnet && (
          <p
            role="status"
            className="border border-amber-600 bg-amber-950/30 p-4 text-sm text-amber-100"
          >
            <strong>TESTNET:</strong> Base Sepolia assets have no real-world value. Use only the
            configured Aave test tokens.
          </p>
        )}
        <label className="block">
          Wallet address
          <input
            className={inputStyle}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            required
            autoComplete="off"
          />
        </label>
        <label className="block">
          Development operator token
          <input
            className={inputStyle}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <p className="text-sm text-slate-400">
          Use POSITIONGUARD_DEV_TOKEN from your server environment. The token stays in this page’s
          memory. It is not proof of wallet ownership.
        </p>
        <details className="rounded border border-slate-700 p-4">
          <summary>Policy for saved analysis</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {financialFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className={inputStyle}
                  value={policy[key]}
                  onChange={(e) => setPolicy({ ...policy, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Both actions enabled; 30-minute cooldown. Preview assumes zero prior spend and no prior
            execution. These are analysis settings, not a saved protection policy.
          </p>
        </details>
        <div className="flex flex-wrap gap-4">
          <button
            disabled={busy}
            className="rounded bg-emerald-500 px-5 py-3 font-medium text-slate-950 disabled:opacity-50"
          >
            {busy ? "Reading Aave…" : "Read position"}
          </button>
          <button
            type="button"
            disabled={busy || !address || !token}
            onClick={() => void evaluate(true)}
            className="rounded border border-slate-500 px-5 py-3 disabled:opacity-50"
          >
            Analyze and save snapshot
          </button>
        </div>
        <p className="text-sm text-slate-400">
          Read position uses default preview thresholds ({initial.targetHealthFactor} /{" "}
          {initial.warningHealthFactor} / {initial.emergencyHealthFactor}) and does not write to the
          database. Saving requires PostgreSQL.
        </p>
      </form>
      {error && (
        <p role="alert" className="mt-6 rounded border border-red-700 p-4 text-red-300">
          {error}
        </p>
      )}
      {result && (
        <section className="mt-10 space-y-8" aria-live="polite">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                "Network",
                `${result.position.chain.name}${result.position.chain.testnet ? " · TESTNET" : ""}`,
              ],
              ["Chain ID", String(result.position.chain.chainId)],
              ["Health factor", result.position.account.healthFactor ?? "Unbounded — no debt"],
              ["Risk", result.analysis.result.riskLevel],
              ["Collateral USD", result.position.account.totalCollateralUsd],
              ["Debt USD", result.position.account.totalDebtUsd],
              ["Available borrow USD", result.position.account.availableBorrowsUsd],
              [
                "Weighted liquidation threshold",
                result.position.account.currentLiquidationThreshold,
              ],
              ["eMode category", result.position.account.eModeCategory],
              ["Block", result.position.blockNumber],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-slate-700 p-4">
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-2 break-all font-medium">{value}</p>
              </div>
            ))}
          </div>
          <p className="break-all text-sm text-slate-400">
            Wallet: {result.position.wallet}
            <br />
            Fetched: {result.position.fetchedAt}
            <br />
            Block hash: {result.position.blockHash}
            <br />
            Snapshot: {result.snapshotId ?? "Not persisted"}
          </p>
          <div className="grid gap-6 border-y border-slate-700 py-6 md:grid-cols-3">
            <AssetSummary
              title="Supplied assets"
              rows={result.position.reserves.filter((r) => BigInt(r.raw.suppliedBalance) > 0n)}
              value={(r) => r.suppliedBalance}
            />
            <AssetSummary
              title="Borrowed assets"
              rows={result.position.reserves.filter(
                (r) => BigInt(r.raw.variableDebt) + BigInt(r.raw.stableDebt) > 0n,
              )}
              value={(r) => `${r.variableDebt} variable / ${r.stableDebt} stable`}
            />
            <AssetSummary
              title="Protection balances"
              rows={result.position.walletProtectionBalances}
              value={(r) => r.walletBalance}
            />
          </div>
          <h2 className="text-xl font-semibold">Relevant reserves and wallet balances</h2>
          {!result.position.reserves.length ? (
            <p>No Aave position or supported reserve-token wallet balances found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Asset",
                      "Supplied",
                      "Collateral",
                      "Variable debt",
                      "Stable debt",
                      "Wallet balance",
                      "Wallet USD",
                    ].map((h) => (
                      <th className="border-b border-slate-700 p-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.position.reserves.map((r) => (
                    <tr key={r.asset}>
                      <td className="p-3">
                        <a
                          className="text-emerald-400"
                          href={`${result.position.chain.blockExplorerBaseUrl}/token/${r.asset}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.symbol}
                        </a>
                      </td>
                      <td className="p-3">{r.suppliedBalance}</td>
                      <td className="p-3">{r.collateralEnabled ? "Yes" : "No"}</td>
                      <td className="p-3">{r.variableDebt}</td>
                      <td className="p-3">{r.stableDebt}</td>
                      <td className="p-3">{r.walletBalance}</td>
                      <td className="p-3">{r.walletBalanceUsd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="rounded border border-slate-700 p-5">
            <h2 className="text-xl font-semibold">MEI preview: {result.analysis.result.status}</h2>
            <p className="mt-2">{result.analysis.result.action}</p>
            {result.analysis.result.selectedCandidate && (
              <p className="mt-2">
                {result.analysis.result.selectedCandidate.tokenAmount}{" "}
                {result.analysis.result.selectedCandidate.assetSymbol} · $
                {result.analysis.result.selectedCandidate.estimatedUsdValue} · projected HF{" "}
                {result.analysis.result.selectedCandidate.expectedHealthFactor ?? "Unbounded"}
              </p>
            )}
            <p className="mt-3 text-slate-400">{result.analysis.result.reasoning}</p>
            <p className="mt-3 text-sm text-slate-400">{result.analysis.contextAssumption}</p>
          </div>
          {result.analysis.result.candidates.length > 0 && (
            <details>
              <summary>All {result.analysis.result.candidates.length} evaluated candidates</summary>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {["Action", "Asset", "Amount", "USD", "Projected HF", "Outcome"].map((h) => (
                        <th className="p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.analysis.result.candidates.map((c) => (
                      <tr key={c.id}>
                        <td className="p-2">{c.type}</td>
                        <td className="p-2">{c.assetSymbol}</td>
                        <td className="p-2">{c.tokenAmount}</td>
                        <td className="p-2">{c.estimatedUsdValue}</td>
                        <td className="p-2">{c.expectedHealthFactor ?? "Unbounded"}</td>
                        <td className="p-2">
                          {c.rejectionReason ??
                            (c.id === result.analysis.result.selectedCandidate?.id
                              ? "Selected"
                              : c.requiresApproval
                                ? "Approval required"
                                : "Valid alternative")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}
    </>
  );
}

function AssetSummary({
  title,
  rows,
  value,
}: {
  title: string;
  rows: AavePosition["reserves"];
  value: (row: AavePosition["reserves"][number]) => string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.asset}>
              <span className="font-medium">{row.symbol}</span>{" "}
              <span className="text-slate-400">{value(row)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">None</p>
      )}
    </div>
  );
}
