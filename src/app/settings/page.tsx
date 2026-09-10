import { PageHeader, StatusPill } from "@/components/ui";
import { PolicyForm } from "@/components/policy-form";
import { loadProductData } from "@/lib/product/data";
export const dynamic = "force-dynamic";
export default async function SettingsPage() { const data = await loadProductData(); return <div className="page narrow"><PageHeader eyebrow="PROTECTION POLICY" title="Settings" description="Define immutable risk limits for autonomous defense."><StatusPill tone={data.policy.enabled ? "good" : "neutral"}>{data.policy.enabled ? "PROTECTION ENABLED" : "PROTECTION DISABLED"}</StatusPill></PageHeader><PolicyForm initial={data.policy}/></div>; }
