import "server-only";
import { createHmac } from "node:crypto";
import { getPrisma } from "../db/prisma";
import type { Prisma } from "../../generated/prisma/client";

export const notificationTypes = ["RISK_WATCH", "RISK_HIGH", "RISK_CRITICAL", "MEI_SELECTED", "PROTECTION_BLOCKED", "APPROVAL_REQUIRED", "EXECUTION_STARTED", "EXECUTION_CONFIRMED", "EXECUTION_FAILED", "POSITION_CHANGED"] as const;
export type NotificationEventType = typeof notificationTypes[number];
export interface NotificationEvent { userId: string; type: NotificationEventType; title: string; message: string; dedupeKey: string; metadata?: Record<string, unknown> }
export interface NotificationStore {
  notification: {
    findUnique(args: { where: { dedupeKey: string } }): Promise<{ id: string } | null>;
    create(args: { data: { userId: string; type: NotificationEventType; title: string; message: string; dedupeKey: string; metadata: Prisma.InputJsonValue; webhookStatus: "PENDING" | "SKIPPED" } }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface NotificationProvider { deliver(event: NotificationEvent): Promise<void> }
export class WebhookNotificationProvider implements NotificationProvider {
  constructor(private readonly url = process.env.POSITIONGUARD_WEBHOOK_URL, private readonly secret = process.env.POSITIONGUARD_WEBHOOK_SECRET) {}
  async deliver(event: NotificationEvent) {
    if (!this.url) return;
    const body = JSON.stringify({ version: 1, event });
    const signature = this.secret ? createHmac("sha256", this.secret).update(body).digest("hex") : undefined;
    const response = await fetch(this.url, { method: "POST", headers: { "Content-Type": "application/json", ...(signature ? { "X-PositionGuard-Signature": `sha256=${signature}` } : {}) }, body, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`WEBHOOK_HTTP_${response.status}`);
  }
}

export async function notify(
  event: NotificationEvent,
  options: { store?: NotificationStore; provider?: NotificationProvider | null } = {},
) {
  const store = options.store ?? getPrisma();
  const existing = await store.notification.findUnique({ where: { dedupeKey: event.dedupeKey } });
  if (existing) return { notificationId: existing.id, duplicate: true, delivered: false };
  const provider = options.provider === undefined ? (process.env.POSITIONGUARD_WEBHOOK_URL ? new WebhookNotificationProvider() : null) : options.provider;
  const row = await store.notification.create({ data: { userId: event.userId, type: event.type, title: event.title, message: event.message, dedupeKey: event.dedupeKey, metadata: JSON.parse(JSON.stringify(event.metadata ?? {})) as Prisma.InputJsonValue, webhookStatus: provider ? "PENDING" : "SKIPPED" } });
  if (!provider) return { notificationId: row.id, duplicate: false, delivered: false };
  try {
    await provider.deliver(event);
    await store.notification.update({ where: { id: row.id }, data: { webhookStatus: "DELIVERED", webhookAttempts: { increment: 1 }, webhookLastError: null } });
    return { notificationId: row.id, duplicate: false, delivered: true };
  } catch (error) {
    await store.notification.update({ where: { id: row.id }, data: { webhookStatus: "FAILED", webhookAttempts: { increment: 1 }, webhookLastError: error instanceof Error ? error.message.slice(0, 500) : "WEBHOOK_FAILED" } });
    return { notificationId: row.id, duplicate: false, delivered: false };
  }
}

// Email remains provider-driven so autonomous monitoring never depends on external credentials.
export type EmailNotificationProvider = NotificationProvider;
