import { PageHeader, StatusPill } from "@/components/ui";
import { StressForm } from "@/components/stress-form";
import { loadScenarioData as loadProductData } from "@/lib/product/current-data";
import { createScenarioAuthorization } from "@/lib/stress/scenario-auth";
import { Icon } from "@/components/icons";
import { formatNumber, timeAgo } from "@/lib/product/format";
export const dynamic = "force-dynamic";
export default async function ScenarioPage() {
  const data = await loadProductData();
  const assets = [
    ...new Set(
      data.position.reserves.filter((item) => item.collateralEnabled).map((item) => item.symbol),
    ),
  ];
  let scenarioAuthorization: string | null = null;
  try {
    if (data.protectedAccountId)
      scenarioAuthorization = createScenarioAuthorization({
        protectedAccountId: data.protectedAccountId,
        chainId: data.network.chainId,
      });
  } catch {}
  return (
    <div className="page scenario-page">
      <PageHeader
        eyebrow="POSITION SCENARIO"
        title="Stress Test Your Position"
        description="See how PositionGuard would react if the market moved against your Aave position."
      >
        <StatusPill tone="blue">SIMULATION ONLY</StatusPill>
      </PageHeader>
      <div className="simulation-state" role="note">
        <b>SIMULATION ONLY</b>
        <span>NO ONCHAIN STATE CHANGED</span>
      </div>
      <div className="scenario-snapshot" role="note" aria-label="Live position snapshot used">
        <span>Based on live position</span>
        <b>HF {formatNumber(data.position.healthFactor, 4)}</b>
        <b>
          Snapshot block{" "}
          {data.position.blockNumber ? `#${data.position.blockNumber}` : "unavailable"}
        </b>
        <small>
          {data.position.capturedAt
            ? `Updated ${timeAgo(data.position.capturedAt)}`
            : "Not captured"}
        </small>
      </div>
      <section className="scenario-intro">
        <div className="round-icon">
          <Icon name="activity" />
        </div>
        <div>
          <h2>Explore a market downturn safely</h2>
          <p>
            Choose a collateral asset and simulate a price drop. PositionGuard will estimate the
            resulting health factor and the smallest protection action needed to restore your
            configured safety target.
          </p>
        </div>
        <div className="simulation-promise">
          <Icon name="shield" />
          <span>
            <b>No funds move</b>No blockchain transaction is submitted.
          </span>
        </div>
      </section>
      <StressForm
        scenarioAuthorization={scenarioAuthorization}
        assets={assets.length ? assets : ["WETH"]}
      />
    </div>
  );
}
