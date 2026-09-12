"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, ShieldMark } from "./icons";
import { LoadingButton } from "./loading-button";

type EthereumProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  isRabby?: boolean;
  providers?: EthereumProvider[];
};
type Eip6963Provider = {
  info: { name: string; rdns: string };
  provider: EthereumProvider;
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
const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_CHAIN_HEX = "0x14a34";

function providerErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "number" ? error.code : null;
}

async function discoverMetaMask(): Promise<EthereumProvider | null> {
  const announced: Eip6963Provider[] = [];
  const onAnnouncement = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Provider>).detail;
    if (detail?.provider && detail.info) announced.push(detail);
  };

  window.addEventListener("eip6963:announceProvider", onAnnouncement);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  window.removeEventListener("eip6963:announceProvider", onAnnouncement);

  const announcedMetaMask = announced.find(
    ({ info }) => info.rdns === "io.metamask" || info.name.toLowerCase() === "metamask",
  );
  if (announcedMetaMask) return announcedMetaMask.provider;

  const injected = (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
  const legacyProviders = injected?.providers ?? [];
  const legacyMetaMask = legacyProviders.find(
    (provider) => provider.isMetaMask && !provider.isBraveWallet && !provider.isRabby,
  );
  if (legacyMetaMask) return legacyMetaMask;
  if (injected?.isMetaMask && !injected.isBraveWallet && !injected.isRabby) return injected;
  return null;
}

async function ensureSupportedChain(provider: EthereumProvider) {
  const readChainId = async () => {
    const value = (await provider.request({ method: "eth_chainId" })) as string;
    return Number.parseInt(value, 16);
  };

  const currentChainId = await readChainId();
  if (currentChainId === BASE_MAINNET_CHAIN_ID || currentChainId === BASE_SEPOLIA_CHAIN_ID) {
    return currentChainId;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_CHAIN_HEX }],
    });
  } catch (error) {
    if (providerErrorCode(error) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_SEPOLIA_CHAIN_HEX,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        },
      ],
    });
  }

  const selectedChainId = await readChainId();
  if (selectedChainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(
      "MetaMask did not switch to Base Sepolia. Approve the network switch and retry.",
    );
  }
  return selectedChainId;
}

export function WalletOnboarding() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [status, setStatus] = useState("Connect MetaMask to begin. No funds will move.");
  const [busy, setBusy] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("Connecting wallet…");
  const [detection, setDetection] = useState<Detection | null>(null);
  async function tryAnotherWallet() {
    if (continuing) return;
    setContinuing(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      setDetection(null);
      setAddress("");
      setChainId(0);
      setStage(0);
      setStatus("Connect another MetaMask account to check its Aave V3 position.");
    } finally {
      setContinuing(false);
    }
  }
  async function begin() {
    if (busy) return;
    setBusy(true);
    try {
      setPendingLabel("Waiting for wallet selection…");
      setStatus("Waiting for MetaMask wallet selection…");
      const ethereum = await discoverMetaMask();
      if (!ethereum) {
        throw new Error(
          "MetaMask was not found. Enable the MetaMask extension for this site and try again.",
        );
      }
      setStatus("Checking the selected MetaMask network…");
      const selectedChain = await ensureSupportedChain(ethereum);
      setPendingLabel("Connecting wallet…");
      setStatus("Approve the connection request in MetaMask…");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const walletAddress = accounts[0];
      if (!walletAddress) throw new Error("No wallet account was selected.");
      const confirmedChain = await ensureSupportedChain(ethereum);
      if (confirmedChain !== selectedChain) {
        throw new Error("The MetaMask network changed during sign-in. Please try again.");
      }
      setAddress(walletAddress);
      setChainId(selectedChain);
      setStage(1);
      setPendingLabel("Waiting for signature…");
      setStatus("Sign the ownership message in your wallet. This is not a transaction.");
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, chainId: selectedChain }),
      });
      const challenge = (await challengeResponse.json()) as {
        challengeId?: string;
        message?: string;
        error?: { code?: string; message?: string };
      };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message)
        throw new Error(
          challenge.error?.message ?? "PositionGuard could not create a sign-in challenge.",
        );
      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [challenge.message, walletAddress],
      })) as string;
      setPendingLabel("Verifying ownership…");
      setStatus("Verifying wallet ownership with PositionGuard…");
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
      const verified = (await verifyResponse.json()) as {
        error?: { code?: string; message?: string };
      };
      if (!verifyResponse.ok)
        throw new Error(
          verified.error?.message ?? "PositionGuard could not verify wallet ownership.",
        );
      setStage(2);
      setPendingLabel("Reading Aave position…");
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
          ? "Protected account ready."
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
                <Icon name={detection.detected ? "check" : "activity"} />
                <div>
                  <b>
                    {detection.detected
                      ? "Aave V3 position detected"
                      : "No supported Aave V3 position detected"}
                  </b>
                  {detection.detected ? (
                    <span>
                      Health Factor {detection.position.healthFactor ?? "No debt"} · $
                      {detection.position.totalCollateralUsd} collateral · $
                      {detection.position.totalDebtUsd} debt
                    </span>
                  ) : (
                    <span>
                      Choose another wallet with supplied collateral or debt on Aave V3 Base
                      Sepolia.
                    </span>
                  )}
                </div>
              </div>
              {detection.detected ? (
                <LoadingButton
                  className="button primary"
                  pending={continuing}
                  pendingLabel="Opening protection setup…"
                  onClick={() => {
                    if (continuing) return;
                    setContinuing(true);
                    router.push("/settings?onboarding=1");
                  }}
                >
                  Continue to Protection Setup <Icon name="arrow" />
                </LoadingButton>
              ) : (
                <LoadingButton
                  className="button primary"
                  pending={continuing}
                  pendingLabel="Resetting wallet…"
                  onClick={() => void tryAnotherWallet()}
                >
                  Connect another wallet
                </LoadingButton>
              )}
            </>
          ) : (
            <>
              <LoadingButton
                className="button primary"
                pending={busy}
                pendingLabel={pendingLabel}
                disabled={busy}
                onClick={() => void begin()}
              >
                <Icon name="shield" />
                {stage ? "Continue wallet verification" : "Connect wallet"}
              </LoadingButton>
              <p role="status" aria-live="polite">
                {status}
              </p>
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
