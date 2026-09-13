import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("navigation hardening", () => {
  it("provides route-level skeletons for every product destination", () => {
    for (const route of [
      "dashboard",
      "position",
      "protection",
      "scenario",
      "activity",
      "notifications",
      "settings",
    ]) {
      expect(source(`src/app/${route}/loading.tsx`)).toContain("RouteSkeleton");
    }
    expect(source("src/components/route-skeleton.tsx")).toContain('aria-busy="true"');
  });

  it("keeps heavy product collections out of the root shell", () => {
    const layout = source("src/app/layout.tsx");
    const shellLoader = source("src/lib/product/shell-data.ts");
    expect(layout).not.toContain("loadShellData");
    expect(layout).not.toContain("loadProductData");
    expect(source("src/app/api/shell/route.ts")).toContain("loadShellData");
    expect(shellLoader).not.toContain("auditEvents");
    expect(shellLoader).not.toContain("executions");
    expect(shellLoader).not.toContain("snapshots");
    expect(shellLoader).toContain("candidates");
  });

  it("shows distinct active and pending navigation states with normal Link prefetching", () => {
    const shell = source("src/components/app-shell.tsx");
    expect(shell).toContain('pending ? "pending"');
    expect(shell).toContain("nav-spinner");
    expect(shell).not.toContain("prefetch={false}");
    expect(shell).toContain("prefetch key={href}");
  });

  it("shares short-lived account data across tabs and parallelizes independent reads", () => {
    const data = source("src/lib/product/data.ts");
    expect(data).toContain("unstable_cache");
    expect(data).toContain("positionguard-product-data-v1");
    expect(data).toContain("revalidate: 15");
    expect(data).toContain("const userPromise");
    expect(data).toContain("scopedExecutionsPromise");
  });

  it("visually separates the safe empty action from the overview grid", () => {
    expect(source("src/app/dashboard/page.tsx")).toContain('className="dashboard-empty-action"');
    expect(source("src/app/globals.css")).toMatch(
      /\.dashboard-empty-action\s*\{[^}]*margin-top:\s*14px/s,
    );
  });
});

describe("async feedback hardening", () => {
  it("centralizes accessible loading button behavior", () => {
    const button = source("src/components/loading-button.tsx");
    expect(button).toContain("pendingLabel");
    expect(button).toContain("aria-busy={pending}");
    expect(button).toContain("disabled={disabled || pending}");
  });

  it("prevents repeat settings and scenario submissions", () => {
    expect(source("src/components/policy-form.tsx")).toContain("if (busy) return");
    expect(source("src/components/policy-form.tsx")).toContain('pendingLabel="Saving…"');
    expect(source("src/components/stress-form.tsx")).toContain("if (busy) return");
    expect(source("src/components/stress-form.tsx")).toContain(
      'pendingLabel="Running stress test…"',
    );
  });

  it("makes wallet and notification stages explicit", () => {
    const wallet = source("src/components/wallet-onboarding.tsx");
    for (const stage of [
      "Waiting for wallet selection…",
      "Waiting for signature…",
      "Verifying ownership…",
      "Reading Aave position…",
      "Protected account ready.",
    ])
      expect(wallet).toContain(stage);
    const notices = source("src/components/notification-center.tsx");
    expect(notices).toContain('pendingLabel="Updating…"');
    expect(notices).toContain("if (pendingId) return");
  });

  it("keeps execution-time live revalidation untouched", () => {
    const execution = source("src/lib/execution/orchestrator.ts");
    expect(execution).toContain("revalidate");
    expect(source("src/lib/product/shell-data.ts")).not.toContain("execution/orchestrator");
  });
});
