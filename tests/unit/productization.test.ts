import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildWalletChallenge,
  generateNonce,
  isValidWalletSignature,
  normalizeWalletAddress,
  sessionCookie,
} from "../../src/lib/security/wallet-auth";
import { mapFundingReadiness, mapWorkerHealth } from "../../src/lib/product/status";
import { postExecutionExplanation, validateExplanation } from "../../src/lib/agent/explanation";
import { readFileSync } from "node:fs";
import { databaseConnectionString } from "../../src/lib/db/connection";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("wallet session integration", () => {
  it("keeps database TLS strict unless self-signed certificates are explicitly allowed", () => {
    const strict = "postgresql://user:secret@example.test:5432/postgres?sslmode=verify-full";
    expect(databaseConnectionString(strict, false)).toBe(strict);
    const development = new URL(databaseConnectionString(strict, true));
    expect(development.searchParams.get("sslmode")).toBe("no-verify");
  });

  it("uses explicit session identity in the product shell", () => {
    const shell = source("src/components/app-shell.tsx");
    expect(shell).toContain("session.authenticated");
    expect(shell).toContain("session.walletAddress");
    expect(shell).not.toContain("position.wallet");
  });

  it("guards product data and notifications with a server session", () => {
    expect(source("src/lib/product/current-data.ts")).toContain('redirect("/onboarding")');
    expect(source("src/app/notifications/page.tsx")).toContain('redirect("/onboarding")');
  });

  it("provides disconnect and expired-session recovery", () => {
    expect(source("src/components/app-shell.tsx")).toContain('method: "DELETE"');
    expect(source("src/components/notification-center.tsx")).toContain("Reconnect Wallet");
  });

  it("selects MetaMask explicitly and switches unsupported injected chains", () => {
    const onboarding = source("src/components/wallet-onboarding.tsx");
    expect(onboarding).toContain("eip6963:requestProvider");
    expect(onboarding).toContain('info.rdns === "io.metamask"');
    expect(onboarding).toContain('method: "wallet_switchEthereumChain"');
    expect(onboarding).toContain('const BASE_SEPOLIA_CHAIN_HEX = "0x14a34"');
  });
});

describe("wallet onboarding security", () => {
  it("generates unique high-entropy nonces", () => {
    const values = new Set(Array.from({ length: 20 }, generateNonce));
    expect(values.size).toBe(20);
    expect([...values].every((value) => value.length >= 43)).toBe(true);
  });
  it("normalizes wallet addresses and verifies the signed challenge", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildWalletChallenge({
      domain: "positionguard.test",
      uri: "https://positionguard.test",
      walletAddress: account.address,
      chainId: 84532,
      nonce: generateNonce(),
      issuedAt: new Date("2026-09-11T10:00:00Z"),
      expiresAt: new Date("2026-09-11T10:05:00Z"),
    });
    const signature = await account.signMessage({ message });
    expect(
      await isValidWalletSignature({
        walletAddress: normalizeWalletAddress(account.address),
        message,
        signature,
      }),
    ).toBe(true);
    expect(
      await isValidWalletSignature({
        walletAddress: privateKeyToAccount(generatePrivateKey()).address,
        message,
        signature,
      }),
    ).toBe(false);
  });
  it("creates hardened session-cookie attributes", () => {
    const cookie = sessionCookie("opaque-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("opaque-token=");
  });
});

describe("product readiness presentation", () => {
  const base = {
    requiredAsset: "USDC",
    requiredAmount: "25",
    availableBalance: "10",
    currentAllowance: "0",
    requiredAllowance: "25",
    sender: "0x0000000000000000000000000000000000000001",
    reason: null,
  };
  it("maps funding states to user-facing actions", () => {
    expect(mapFundingReadiness({ ...base, state: "INSUFFICIENT_BALANCE" }).status).toBe(
      "INSUFFICIENT_BALANCE",
    );
    expect(mapFundingReadiness({ ...base, state: "INSUFFICIENT_ALLOWANCE" }).explanation).toContain(
      "bounded",
    );
    expect(mapFundingReadiness({ ...base, state: "READY" }).explanation).toBe(
      "Protection funding is ready.",
    );
  });
  it("keeps unchecked and no-action funding states distinct from KeeperHub failures", () => {
    expect(mapFundingReadiness(null)).toMatchObject({ status: "NOT_CHECKED" });
    expect(mapFundingReadiness(null, "NO_ACTION_REQUIRED")).toMatchObject({
      status: "NO_ACTION_REQUIRED",
      explanation: "No protection action currently requires funding.",
    });
    expect(mapFundingReadiness(null).status).not.toBe("KEEPERHUB_UNAVAILABLE");
  });
  it("does not render contradictory empty funding state details", () => {
    const panel = source("src/components/funding-panel.tsx");
    expect(panel).toMatch(/\{readiness && \(\s*<dl>/);
    expect(panel).toContain("mapFundingReadiness(null)");
  });
  it("returns a non-error state for a safe position without an MEI", () => {
    const route = source("src/app/api/funding-readiness/route.ts");
    expect(route).toContain("if (!prepared.analysis.result.selectedCandidate)");
    expect(route).toContain('selected.readiness?.state ?? "NO_ACTION_REQUIRED"');
    expect(route).toContain('"NO_ACTIONABLE_CANDIDATE"');
    expect(route).toContain('mapFundingReadiness(selected.readiness, "NO_ACTION_REQUIRED")');
  });
  it("maps fresh, stale, and missing worker checks", () => {
    const now = new Date("2026-09-11T10:10:00Z");
    expect(
      mapWorkerHealth({
        enabled: true,
        lastCheck: "2026-09-11T10:09:30Z",
        lastRunStatus: "MONITORED",
        pollingIntervalMs: 60_000,
        now,
      }).status,
    ).toBe("ONLINE");
    expect(
      mapWorkerHealth({
        enabled: true,
        lastCheck: "2026-09-11T10:07:00Z",
        lastRunStatus: "FAILED",
        pollingIntervalMs: 60_000,
        now,
      }).status,
    ).toBe("DEGRADED");
    expect(
      mapWorkerHealth({
        enabled: true,
        lastCheck: null,
        lastRunStatus: null,
        pollingIntervalMs: 60_000,
        now,
      }).status,
    ).toBe("NOT_STARTED");
  });
  it("restricts candidate references in every AI field", () =>
    expect(() =>
      validateExplanation(
        {
          riskSummary: "Risk",
          selectionReason: "Selection",
          policySummary: "Policy",
          outcomeSummary: null,
          referencedCandidateIds: ["known"],
          rejectedReasons: [{ candidateId: "invented", reason: "Made up" }],
        },
        ["known"],
      ),
    ).toThrow("AI_REFERENCED_UNKNOWN_CANDIDATE"));
  it("explains verified post-execution outcomes", () =>
    expect(
      postExecutionExplanation({
        amount: "0.212852",
        asset: "USDC",
        healthFactorBefore: "1.5499",
        healthFactorAfter: "1.60",
        status: "CONFIRMED",
      }),
    ).toContain("improved from 1.5499 to 1.60"));
});
