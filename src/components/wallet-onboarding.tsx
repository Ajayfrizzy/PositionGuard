"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, ShieldMark } from "./icons";

type EthereumProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};
type Detection = {
  detected: boolean;
  position: {
    healthFactor: string | null;
    totalCollateralUsd: string;
    totalDebtUsd: string;
    reserveCount: number;
  };
};
const steps = [
  "Connect wallet",
  "Verify ownership",
  "Detect Aave position",
  "Configure protection",
  "Review funding",
  "Enable protection",
];

export function WalletOnboarding() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [status, setStatus] = useState("Connect MetaMask to begin. No funds will move.");
  const [busy, setBusy] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);
  async function begin() {
    setBusy(true);
    try {
      const ethereum = (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
      if (!ethereum) throw new Error("MetaMask or another EVM wallet was not found.");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const walletAddress = accounts[0];
      if (!walletAddress) throw new Error("No wallet account was selected.");
      const chainHex = (await ethereum.request({ method: "eth_chainId" })) as string;
      const selectedChain = Number.parseInt(chainHex, 16);
      setAddress(walletAddress);
      setChainId(selectedChain);
      setStage(1);
      setStatus("Sign the ownership message in your wallet. This is not a transaction.");
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, chainId: selectedChain }),
      });
      const challenge = (await challengeResponse.json()) as {
        challengeId?: string;
        message?: string;
        error?: { code?: string };
      };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message)
        throw new Error(challenge.error?.code ?? "Could not create a sign-in challenge.");
      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [challenge.message, walletAddress],
      })) as string;
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          walletAddress,
          chainId: selectedChain,
          signature,
        }),
      });
      const verified = (await verifyResponse.json()) as { error?: { code?: string } };
      if (!verifyResponse.ok)
        throw new Error(verified.error?.code ?? "Wallet verification failed.");
      setStage(2);
      setStatus("Ownership verified. Reading your Aave V3 position…");
      const positionResponse = await fetch("/api/onboarding/position", { method: "POST" });
      const position = (await positionResponse.json()) as Detection & {
        error?: { message?: string };
      };
      if (!positionResponse.ok)
        throw new Error(position.error?.message ?? "Aave position detection failed.");
      setDetection(position);
      setStage(3);
      setStatus(
        position.detected
          ? "Aave position detected and protected account created."
          : "Wallet verified. No active supported Aave position was found on this network.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Wallet onboarding could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <header>
          <ShieldMark className="onboarding-mark" />
          <div>
            <p className="eyebrow">POSITIONGUARD SETUP</p>
            <h1>Protect your Aave position</h1>
            <p>
              Connect, verify ownership, and choose exactly how PositionGuard may respond to risk.
            </p>
          </div>
        </header>
        <ol className="onboarding-steps">
          {steps.map((label, index) => (
            <li
              className={index < stage ? "complete" : index === stage ? "active" : ""}
              key={label}
            >
              <span>{index < stage ? "✓" : index + 1}</span>
              <b>{label}</b>
            </li>
          ))}
        </ol>
        <div className="onboarding-action">
          {detection ? (
            <>
              <div className="position-detected">
                <Icon name="check" />
                <div>
                  <b>
                    {detection.detected ? "Aave position detected" : "Protected wallet created"}
                  </b>
                  <span>
                    Health factor {detection.position.healthFactor ?? "No debt"} · $
                    {detection.position.totalCollateralUsd} collateral · $
                    {detection.position.totalDebtUsd} debt
                  </span>
                </div>
              </div>
              <button
                className="button primary"
                onClick={() => router.push("/settings?onboarding=1")}
              >
                Continue to Protection Setup <Icon name="arrow" />
              </button>
            </>
          ) : (
            <>
              <button className="button primary" disabled={busy} onClick={() => void begin()}>
                <Icon name="shield" />
                {busy
                  ? "Waiting for wallet…"
                  : stage
                    ? "Continue wallet verification"
                    : "Connect wallet"}
              </button>
              <p role="status">{status}</p>
            </>
          )}{" "}
        </div>
        {address && (
          <footer>
            <span>
              Wallet {address.slice(0, 6)}…{address.slice(-4)}
            </span>
            <span>Chain ID {chainId}</span>
          </footer>
        )}
      </section>
    </main>
  );
}
