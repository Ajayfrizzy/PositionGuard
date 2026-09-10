-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('SAFE', 'WATCH', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('NO_ACTION', 'REPAY_DEBT', 'ADD_COLLATERAL', 'REQUIRE_APPROVAL');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('NO_ACTION', 'READY', 'REQUIRE_APPROVAL', 'NO_SAFE_ACTION', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('NOT_STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'UNCONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectionPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "targetHealthFactor" DECIMAL(30,6) NOT NULL,
    "warningHealthFactor" DECIMAL(30,6) NOT NULL,
    "emergencyHealthFactor" DECIMAL(30,6) NOT NULL,
    "maxAutonomousAmountUsd" DECIMAL(30,6) NOT NULL,
    "maxDailyAutonomousAmountUsd" DECIMAL(30,6) NOT NULL,
    "approvalRequiredAboveUsd" DECIMAL(30,6) NOT NULL,
    "allowRepay" BOOLEAN NOT NULL,
    "allowAddCollateral" BOOLEAN NOT NULL,
    "interventionCooldownMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtectionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "healthFactor" DECIMAL(60,6),
    "totalCollateralUsd" DECIMAL(30,6) NOT NULL,
    "totalDebtUsd" DECIMAL(30,6) NOT NULL,
    "availableBorrowsUsd" DECIMAL(30,6) NOT NULL,
    "normalizedContext" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectionDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "selectedAction" "ActionType" NOT NULL,
    "selectedAsset" TEXT,
    "selectedAmount" DECIMAL(30,6),
    "expectedHealthFactor" DECIMAL(60,6),
    "reasoning" TEXT NOT NULL,
    "reasoningContext" JSONB NOT NULL,
    "policyContext" JSONB NOT NULL,
    "status" "DecisionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateAction" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(30,6) NOT NULL,
    "estimatedUsdValue" DECIMAL(30,6) NOT NULL,
    "expectedHealthFactor" DECIMAL(60,6),
    "valid" BOOLEAN NOT NULL,
    "policyValidity" BOOLEAN NOT NULL,
    "reachesTarget" BOOLEAN NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "rejectionReason" TEXT,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "CandidateAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "keeperHubExecutionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "action" "ActionType" NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "simulationStatus" "SimulationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "executionStatus" "ExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "transactionHash" TEXT,
    "transactionLink" TEXT,
    "receiptVerified" BOOLEAN NOT NULL DEFAULT false,
    "healthFactorBefore" DECIMAL(60,6),
    "healthFactorAfter" DECIMAL(60,6),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ProtectionPolicy_userId_chainId_key" ON "ProtectionPolicy"("userId", "chainId");

-- CreateIndex
CREATE INDEX "PositionSnapshot_userId_chainId_capturedAt_idx" ON "PositionSnapshot"("userId", "chainId", "capturedAt");

-- CreateIndex
CREATE INDEX "ProtectionDecision_userId_createdAt_idx" ON "ProtectionDecision"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateAction_decisionId_rank_key" ON "CandidateAction"("decisionId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_keeperHubExecutionId_key" ON "Execution"("keeperHubExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_idempotencyKey_key" ON "Execution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Execution_decisionId_idx" ON "Execution"("decisionId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProtectionPolicy" ADD CONSTRAINT "ProtectionPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionSnapshot" ADD CONSTRAINT "PositionSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtectionDecision" ADD CONSTRAINT "ProtectionDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtectionDecision" ADD CONSTRAINT "ProtectionDecision_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PositionSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAction" ADD CONSTRAINT "CandidateAction_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ProtectionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ProtectionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

