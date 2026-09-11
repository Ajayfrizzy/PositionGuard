import { PageHeader, StatusPill } from "@/components/ui";
import { StressForm } from "@/components/stress-form";
import { loadProductData } from "@/lib/product/data";
export const dynamic = "force-dynamic";
export default async function ScenarioPage() { const data = await loadProductData(); const assets = [...new Set(data.position.reserves.filter(item => item.collateralEnabled).map(item => item.symbol))]; return <div className="page narrow"><PageHeader eyebrow="DETERMINISTIC STRESS ENGINE" title="Position scenarios" description="Apply hypothetical asset-price shocks to the latest persisted position."><StatusPill tone="blue">SIMULATION ONLY</StatusPill></PageHeader><StressForm protectedAccountId={data.protectedAccountId} chainId={data.network.chainId} assets={assets.length ? assets : ["WETH"]}/></div>; }
