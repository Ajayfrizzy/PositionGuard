import { NotificationCenter } from "@/components/notification-center";
import { PageHeader } from "@/components/ui";
import { getServerSession } from "@/lib/security/session-context";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function NotificationsPage() {
  if (!(await getServerSession())) redirect("/onboarding");
  return (
    <div className="page">
      <PageHeader
        eyebrow="STAY INFORMED"
        title="Notifications"
        description="Risk changes, approvals, protection actions, and verified outcomes."
      />
      <NotificationCenter />
    </div>
  );
}
