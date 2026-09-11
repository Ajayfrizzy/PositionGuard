import { WalletOnboarding } from "@/components/wallet-onboarding";
import { getServerSession } from "@/lib/security/session-context";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerSession();
  if (session) redirect("/dashboard");
  return <WalletOnboarding />;
}
