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

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("wallet session integration", () => {
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
      "NEEDS FUNDING",
    );
    expect(mapFundingReadiness({ ...base, state: "INSUFFICIENT_ALLOWANCE" }).explanation).toContain(
      "bounded",
    );
    expect(mapFundingReadiness({ ...base, state: "READY" }).explanation).toContain("enough USDC");
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
    ).toBe("OFFLINE");
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
