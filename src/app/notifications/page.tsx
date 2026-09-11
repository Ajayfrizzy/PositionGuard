import { NotificationCenter } from "@/components/notification-center";
import { PageHeader } from "@/components/ui";
export const dynamic = "force-dynamic";
export default function NotificationsPage() { return <div className="page"><PageHeader eyebrow="STAY INFORMED" title="Notifications" description="Risk changes, approvals, protection actions, and verified outcomes."/><NotificationCenter/></div>; }
