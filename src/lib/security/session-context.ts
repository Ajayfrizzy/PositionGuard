import "server-only";
import { cookies } from "next/headers";
import { getPrisma } from "../db/prisma";
import { hashSecret, SESSION_COOKIE, type WalletSession } from "./wallet-auth";

export async function getServerSession(): Promise<WalletSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 256) return null;
  try {
    const row = await getPrisma().userSession.findUnique({
      where: { tokenHash: hashSecret(token) },
    });
    return !row || row.revokedAt || row.expiresAt <= new Date() ? null : row;
  } catch {
    return null;
  }
}
