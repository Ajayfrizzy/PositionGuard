import { PageHeader, StatusPill } from "@/components/ui";
import { PolicyForm } from "@/components/policy-form";
import { FundingPanel } from "@/components/funding-panel";
import { getChain } from "@/lib/chains/config";
import { loadSettingsData as loadProductData } from "@/lib/product/current-data";
export const dynamic = "force-dynamic";
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const data = await loadProductData();
  const onboarding = (await searchParams).onboarding === "1";
  return (
    <div className="page narrow">
      <PageHeader
        eyebrow={onboarding ? "STEP 4 OF 6 — CONFIGURE PROTECTION" : "PROTECTION POLICY"}
        title="Settings"
        description="Choose how PositionGuard responds and set clear safety limits."
      >
        <StatusPill tone={data.policy.enabled ? "good" : "neutral"}>
          {data.policy.enabled ? "PROTECTION ENABLED" : "PROTECTION DISABLED"}
        </StatusPill>
      </PageHeader>
      <PolicyForm
        initial={data.policy}
        onboarding={onboarding}
        fundingPanel={
          <div id="funding-readiness">
            <FundingPanel
              chainId={data.network.chainId}
              spender={getChain(data.network.chainId).aavePoolAddress}
              onboarding={onboarding}
            />
          </div>
        }
      />
    </div>
  );
}
