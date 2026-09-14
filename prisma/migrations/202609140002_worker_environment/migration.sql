ALTER TABLE "WorkerHeartbeat"
ADD COLUMN "environment" VARCHAR(100) NOT NULL DEFAULT 'legacy';

ALTER TABLE "WorkerHeartbeat"
ALTER COLUMN "environment" DROP DEFAULT;

DROP INDEX "WorkerHeartbeat_chainId_workerName_key";

CREATE UNIQUE INDEX "WorkerHeartbeat_chainId_workerName_environment_key"
ON "WorkerHeartbeat"("chainId", "workerName", "environment");
