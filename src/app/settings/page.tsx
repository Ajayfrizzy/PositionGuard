import { PageHeader, StatusPill } from "@/components/ui";
import { PolicyForm } from "@/components/policy-form";
import { FundingPanel } from "@/components/funding-panel";
import { getChain } from "@/lib/chains/config";
import { loadCurrentProductData as loadProductData } from "@/lib/product/current-data";
export const dynamic = "force-dynamic";
export default async function SettingsPage() { const data = await loadProductData(); return <div className="page narrow"><PageHeader eyebrow="PROTECTION POLICY" title="Settings" description="Choose how PositionGuard responds and set clear safety limits."><StatusPill tone={data.policy.enabled ? "good" : "neutral"}>{data.policy.enabled ? "PROTECTION ENABLED" : "PROTECTION DISABLED"}</StatusPill></PageHeader><FundingPanel chainId={data.network.chainId} spender={getChain(data.network.chainId).aavePoolAddress}/><PolicyForm initial={data.policy}/></div>; }
