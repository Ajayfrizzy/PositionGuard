import { NotificationCenter } from "@/components/notification-center";
import { PageHeader } from "@/components/ui";
import { getServerSession } from "@/lib/security/session-context";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const notificationFilters = ["all", "risk", "recommendations", "executions", "failures", "system"];
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  if (!(await getServerSession())) redirect("/onboarding");
  const requested = (await searchParams).filter;
  const initialFilter = notificationFilters.includes(requested ?? "") ? requested : "all";
  return (
    <div className="page">
      <PageHeader
        eyebrow="STAY INFORMED"
        title="Notifications"
        description="Risk changes, approvals, protection actions, and verified outcomes."
      />
      <NotificationCenter
        initialFilter={
          initialFilter as import("@/lib/notifications/presentation").NotificationFilter
        }
      />
    </div>
  );
}
