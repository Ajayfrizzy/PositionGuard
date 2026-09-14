import { classifyActionNotificationChange, type NotificationAction } from "./transitions";

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
    };

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
    if (notice.type === "POSITION_CHANGED") {
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
    const aTimestamp = a.kind === "mei-group" ? a.latest.createdAt : a.notice.createdAt;
    const bTimestamp = b.kind === "mei-group" ? b.latest.createdAt : b.notice.createdAt;
    return Date.parse(bTimestamp) - Date.parse(aTimestamp);
  });
}
