import { NextResponse } from "next/server";
import { loadShellData } from "@/lib/product/shell-data";
import { getServerSession } from "@/lib/security/session-context";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ protectionAttention: false }, { status: 401 });
  return NextResponse.json(await loadShellData(session.protectedAccountId, session.chainId), {
    headers: { "Cache-Control": "no-store" },
  });
}
