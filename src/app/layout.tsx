import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getServerSession } from "@/lib/security/session-context";
import "./globals.css";
import "./productization.css";

export const metadata: Metadata = {
  title: { default: "PositionGuard", template: "%s · PositionGuard" },
  description: "Autonomous Aave position defense through Minimum Effective Intervention",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession();

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
          protectionAttention={false}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
