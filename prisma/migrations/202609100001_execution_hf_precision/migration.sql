-- Preserve Aave health-factor WAD precision in future execution evidence.
ALTER TABLE "Execution"
  ALTER COLUMN "healthFactorBefore" SET DATA TYPE DECIMAL(78,18),
  ALTER COLUMN "healthFactorAfter" SET DATA TYPE DECIMAL(78,18);

ALTER TABLE "ProtectionDecision"
  ALTER COLUMN "selectedAmount" SET DATA TYPE DECIMAL(78,18),
  ALTER COLUMN "expectedHealthFactor" SET DATA TYPE DECIMAL(78,18);

ALTER TABLE "CandidateAction"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(78,18),
  ALTER COLUMN "expectedHealthFactor" SET DATA TYPE DECIMAL(78,18);
