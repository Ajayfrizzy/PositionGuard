import { classifyActionNotificationChange, type NotificationAction } from "./transitions";
import { classifyProtectionEvent, type EventCategory } from "./classification";

export type NotificationFilter = "all" | EventCategory | "delivery";
export const NOTIFICATION_PAGE_SIZE = 25;

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  webhookStatus: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type MeaningfulNotificationItem =
  | { kind: "notification"; notice: NotificationRecord }
  | {
      kind: "mei-group";
      id: string;
      notices: NotificationRecord[];
      latest: NotificationRecord;
      action: NotificationAction;
    }
  | {
      kind: "execution-group";
      id: string;
      notices: NotificationRecord[];
      latest: NotificationRecord;
    };

export function filterNotifications(
  notifications: NotificationRecord[],
  filter: NotificationFilter,
) {
  if (filter === "all") return notifications;
  if (filter === "delivery")
    return notifications.filter(
      (notice) => notice.webhookStatus === "FAILED" || notice.webhookStatus === "PENDING",
    );
  return notifications.filter((notice) => classifyProtectionEvent(notice) === filter);
}

const executionIdentity = (notice: NotificationRecord) => {
  const fingerprint = notice.metadata?.canonicalIntentFingerprint;
  if (typeof fingerprint === "string" && fingerprint) return fingerprint;
  const executionId = notice.metadata?.executionId;
  if (typeof executionId === "string" && executionId) return executionId;
  const decisionId = notice.metadata?.decisionId;
  return typeof decisionId === "string" && decisionId ? decisionId : null;
};

export function groupExecutionNotifications(
  items: MeaningfulNotificationItem[],
): MeaningfulNotificationItem[] {
  const groups = new Map<
    string,
    Extract<MeaningfulNotificationItem, { kind: "execution-group" }>
  >();
  const result: MeaningfulNotificationItem[] = [];
  for (const item of items) {
    if (item.kind !== "notification" || classifyProtectionEvent(item.notice) !== "executions") {
      result.push(item);
      continue;
    }
    const identity = executionIdentity(item.notice);
    if (!identity) {
      result.push(item);
      continue;
    }
    const existing = groups.get(identity);
    if (existing) {
      existing.notices.push(item.notice);
      if (Date.parse(item.notice.createdAt) > Date.parse(existing.latest.createdAt))
        existing.latest = item.notice;
    } else {
      const group = {
        kind: "execution-group" as const,
        id: `execution:${identity}`,
        notices: [item.notice],
        latest: item.notice,
      };
      groups.set(identity, group);
      result.push(group);
    }
  }
  return result;
}

function parseAction(notice: NotificationRecord): NotificationAction | null {
  const identity = notice.metadata?.actionIdentity;
  if (typeof identity === "string") {
    const [type, asset, ...amountParts] = identity.split(":");
    const amount = amountParts.join(":");
    if (type && asset && amount) return { type, asset, amount };
  }
  const amountAndAsset = notice.message.match(
    /([0-9]+(?:\.[0-9]+)?)\s+([A-Za-z][A-Za-z0-9._-]*)\.?$/,
  );
  if (!amountAndAsset) return null;
  const text = `${notice.title} ${notice.message}`.toLowerCase();
  const type = text.includes("repay")
    ? "REPAY_DEBT"
    : text.includes("supply") || text.includes("collateral") || text.includes("add")
      ? "ADD_COLLATERAL"
      : "MEI_SELECTED";
  return { type, amount: amountAndAsset[1]!, asset: amountAndAsset[2]! };
}

const episodeKey = (notice: NotificationRecord, fallback: number) => {
  const episode = notice.metadata?.riskEpisodeId;
  return typeof episode === "string" && episode ? episode : `historical:${fallback}`;
};

/** Collapses only semantically unchanged MEI recalculations; every row remains inside the group. */
export function buildMeaningfulNotifications(
  notifications: NotificationRecord[],
): MeaningfulNotificationItem[] {
  const chronological = [...notifications].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const items: MeaningfulNotificationItem[] = [];
  let inferredEpisode = 0;
  let currentEpisode = "historical:0";
  let lastMeaningfulAction: NotificationAction | null = null;
  let lastMeaningfulNoticeId: string | null = null;
  let activeNoiseGroup: Extract<MeaningfulNotificationItem, { kind: "mei-group" }> | null = null;

  for (const notice of chronological) {
    if (
      notice.type === "POSITION_CHANGED" &&
      notice.metadata?.outcome !== "STALE_INTERVENTION_CANCELLED"
    ) {
      inferredEpisode += 1;
      currentEpisode = `historical:${inferredEpisode}`;
      lastMeaningfulAction = null;
      lastMeaningfulNoticeId = null;
      activeNoiseGroup = null;
      items.push({ kind: "notification", notice });
      continue;
    }
    if (notice.type !== "MEI_SELECTED") {
      items.push({ kind: "notification", notice });
      continue;
    }

    const explicitEpisode = episodeKey(notice, inferredEpisode);
    if (explicitEpisode !== `historical:${inferredEpisode}` && explicitEpisode !== currentEpisode) {
      currentEpisode = explicitEpisode;
      lastMeaningfulAction = null;
      lastMeaningfulNoticeId = null;
      activeNoiseGroup = null;
    }
    const action = parseAction(notice);
    if (!action) {
      lastMeaningfulAction = null;
      lastMeaningfulNoticeId = null;
      activeNoiseGroup = null;
      items.push({ kind: "notification", notice });
      continue;
    }
    const declaredChange = notice.metadata?.change;
    const change =
      declaredChange === "SELECTED" || declaredChange === "UPDATED"
        ? declaredChange
        : classifyActionNotificationChange(lastMeaningfulAction, action);
    if (change !== "UNCHANGED") {
      lastMeaningfulAction = action;
      lastMeaningfulNoticeId = notice.id;
      activeNoiseGroup = null;
      items.push({ kind: "notification", notice });
      continue;
    }

    if (activeNoiseGroup) {
      activeNoiseGroup.notices.push(notice);
      activeNoiseGroup.latest = notice;
      activeNoiseGroup.action = action;
    } else {
      activeNoiseGroup = {
        kind: "mei-group",
        id: `mei:${currentEpisode}:${lastMeaningfulNoticeId ?? notice.id}`,
        notices: [notice],
        latest: notice,
        action,
      };
      items.push(activeNoiseGroup);
    }
  }

  return items.sort((a, b) => {
    const aTimestamp = a.kind === "notification" ? a.notice.createdAt : a.latest.createdAt;
    const bTimestamp = b.kind === "notification" ? b.notice.createdAt : b.latest.createdAt;
    return Date.parse(bTimestamp) - Date.parse(aTimestamp);
  });
}

export function buildNotificationItems(
  notifications: NotificationRecord[],
  options: { meaningful: boolean; filter: NotificationFilter },
) {
  const filtered = filterNotifications(notifications, options.filter);
  const items = options.meaningful
    ? buildMeaningfulNotifications(filtered)
    : filtered.map((notice) => ({ kind: "notification" as const, notice }));
  return options.filter === "executions" ? groupExecutionNotifications(items) : items;
}

export function notificationFilterCount(
  notifications: NotificationRecord[],
  filter: NotificationFilter,
) {
  if (filter === "executions")
    return buildNotificationItems(notifications, { meaningful: false, filter }).length;
  return filterNotifications(notifications, filter).length;
}

export function paginateNotificationItems<T>(items: T[], visibleCount: number) {
  return items.slice(0, Math.max(NOTIFICATION_PAGE_SIZE, visibleCount));
}

export type DeliveryPresentation = {
  inApp: "RECORDED";
  webhook: "DELIVERED" | "FAILED" | "PENDING" | "NOT CONFIGURED";
  tone: "success" | "warning" | "pending" | "muted";
};

export function notificationDeliveryPresentation(status: string): DeliveryPresentation {
  if (status === "FAILED") return { inApp: "RECORDED", webhook: "FAILED", tone: "warning" };
  if (status === "DELIVERED") return { inApp: "RECORDED", webhook: "DELIVERED", tone: "success" };
  if (status === "PENDING") return { inApp: "RECORDED", webhook: "PENDING", tone: "pending" };
  return { inApp: "RECORDED", webhook: "NOT CONFIGURED", tone: "muted" };
}

export function notificationEventTone(type: string) {
  if (type.includes("FAILED") || type.includes("BLOCKED")) return "danger" as const;
  if (type.includes("RISK") || type === "APPROVAL_REQUIRED") return "warn" as const;
  return "good" as const;
}
