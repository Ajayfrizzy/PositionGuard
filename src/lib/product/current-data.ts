import "server-only";
import { redirect } from "next/navigation";
import { getServerSession } from "../security/session-context";
import { loadProductData, type ProductDataView } from "./data";

export async function loadCurrentProductData(view: ProductDataView = "full") {
  const session = await getServerSession();
  if (!session) redirect("/onboarding");
  return loadProductData(session.protectedAccountId, session.chainId, view);
}

export const loadDashboardData = () => loadCurrentProductData("dashboard");
export const loadPositionData = () => loadCurrentProductData("position");
export const loadProtectionData = () => loadCurrentProductData("protection");
export const loadScenarioData = () => loadCurrentProductData("scenario");
export const loadActivityData = () => loadCurrentProductData("activity");
export const loadSettingsData = () => loadCurrentProductData("settings");
