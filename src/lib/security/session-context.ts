import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getPrisma } from "../db/prisma";
import { hashSecret, SESSION_COOKIE, type WalletSession } from "./wallet-auth";

async function getServerSessionUncached(): Promise<WalletSession | null> {
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

// A layout and its page commonly need the same session during one RSC render.
// React cache keeps that to one indexed lookup without persisting auth state.
export const getServerSession = cache(getServerSessionUncached);
