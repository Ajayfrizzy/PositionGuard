CREATE TABLE "WalletChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "walletAddress" VARCHAR(42) NOT NULL,
  "chainId" INTEGER NOT NULL,
  "nonceHash" VARCHAR(64) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletChallenge_pkey" PRIMARY KEY ("id")
);
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUIRED';
CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletAddress" VARCHAR(42) NOT NULL,
  "chainId" INTEGER NOT NULL,
  "protectedAccountId" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WalletChallenge_nonceHash_key" ON "WalletChallenge"("nonceHash");
CREATE INDEX "WalletChallenge_walletAddress_chainId_createdAt_idx" ON "WalletChallenge"("walletAddress", "chainId", "createdAt");
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");
ALTER TABLE "WalletChallenge" ADD CONSTRAINT "WalletChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
