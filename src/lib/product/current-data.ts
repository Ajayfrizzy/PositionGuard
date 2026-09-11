import "server-only";
import { redirect } from "next/navigation";
import { getServerSession } from "../security/session-context";
import { loadProductData } from "./data";

export async function loadCurrentProductData() {
  const session = await getServerSession();
  if (!session) redirect("/onboarding");
  return loadProductData(session.protectedAccountId, session.chainId);
}
