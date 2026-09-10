-- Restore execution evidence from the full-precision snapshots already retained in PostgreSQL.
UPDATE "Execution" AS execution
SET "healthFactorBefore" = snapshot."healthFactor"
FROM "ProtectionDecision" AS decision
JOIN "PositionSnapshot" AS snapshot ON snapshot."id" = decision."snapshotId"
WHERE execution."decisionId" = decision."id"
  AND snapshot."healthFactor" IS NOT NULL;

UPDATE "Execution" AS execution
SET "healthFactorAfter" = (
  SELECT snapshot."healthFactor"
  FROM "ProtectionDecision" AS decision
  JOIN "PositionSnapshot" AS snapshot
    ON snapshot."userId" = decision."userId"
   AND snapshot."chainId" = (
     SELECT before_snapshot."chainId"
     FROM "PositionSnapshot" AS before_snapshot
     WHERE before_snapshot."id" = decision."snapshotId"
   )
  WHERE decision."id" = execution."decisionId"
    AND snapshot."purpose" = 'POST_EXECUTION'
    AND snapshot."capturedAt" >= execution."createdAt"
    AND snapshot."healthFactor" IS NOT NULL
  ORDER BY snapshot."capturedAt" ASC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM "ProtectionDecision" AS decision
  JOIN "PositionSnapshot" AS snapshot ON snapshot."userId" = decision."userId"
  WHERE decision."id" = execution."decisionId"
    AND snapshot."purpose" = 'POST_EXECUTION'
    AND snapshot."capturedAt" >= execution."createdAt"
    AND snapshot."healthFactor" IS NOT NULL
);
