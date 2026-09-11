import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { loadProductData } from "@/lib/product/data";
import { getServerSession } from "@/lib/security/session-context";
import "./globals.css";
import "./productization.css";

export const metadata: Metadata = {
  title: { default: "PositionGuard", template: "%s · PositionGuard" },
  description: "Autonomous Aave position defense through Minimum Effective Intervention",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession();
  const data = session ? await loadProductData(session.protectedAccountId, session.chainId) : null;

  return (
    <html lang="en">
      <body>
        <AppShell
          session={{
            authenticated: Boolean(session),
            walletAddress: session?.walletAddress ?? null,
            protectedAccountId: session?.protectedAccountId ?? null,
            chainId: session?.chainId ?? null,
          }}
          protectionAttention={data?.protectionAttention ?? false}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
