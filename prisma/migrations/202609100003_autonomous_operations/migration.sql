-- Existing policies intentionally remain approval-gated.
CREATE TYPE "PolicyExecutionMode" AS ENUM ('MONITOR_ONLY', 'REQUIRE_APPROVAL', 'AUTONOMOUS');
CREATE TYPE "FundingReadinessStatus" AS ENUM ('READY', 'INSUFFICIENT_BALANCE', 'INSUFFICIENT_ALLOWANCE', 'SENDER_MISMATCH', 'KEEPERHUB_UNAVAILABLE', 'UNSUPPORTED_ASSET');
CREATE TYPE "NotificationType" AS ENUM ('RISK_WATCH', 'RISK_HIGH', 'RISK_CRITICAL', 'MEI_SELECTED', 'PROTECTION_BLOCKED', 'EXECUTION_STARTED', 'EXECUTION_CONFIRMED', 'EXECUTION_FAILED', 'POSITION_CHANGED');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

ALTER TYPE "DecisionStatus" ADD VALUE 'PROTECTION_BLOCKED';
ALTER TABLE "ProtectionPolicy" ADD COLUMN "executionMode" "PolicyExecutionMode" NOT NULL DEFAULT 'REQUIRE_APPROVAL';
ALTER TABLE "ProtectionDecision" ADD COLUMN "blockerReason" TEXT,
ADD COLUMN "fundingReadiness" "FundingReadinessStatus",
ADD COLUMN "fundingReadinessContext" JSONB;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "readAt" TIMESTAMP(3),
  "webhookStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
  "webhookLastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MonitoringRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "snapshotId" TEXT,
  "decisionId" TEXT,
  "executionOutcome" TEXT,
  "errorCode" TEXT,
  CONSTRAINT "MonitoringRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "MonitoringRun_userId_chainId_startedAt_idx" ON "MonitoringRun"("userId", "chainId", "startedAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
