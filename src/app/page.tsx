import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/security/session-context";

export default async function Home() {
  const session = await getServerSession();
  redirect(session ? "/dashboard" : "/onboarding");
}
