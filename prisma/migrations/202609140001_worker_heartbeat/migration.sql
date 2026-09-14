CREATE TABLE "WorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "workerName" VARCHAR(100) NOT NULL,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "instanceId" VARCHAR(100) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerHeartbeat_chainId_workerName_key"
ON "WorkerHeartbeat"("chainId", "workerName");

CREATE INDEX "WorkerHeartbeat_lastHeartbeatAt_idx"
ON "WorkerHeartbeat"("lastHeartbeatAt");
