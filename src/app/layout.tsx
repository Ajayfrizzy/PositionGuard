import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getServerSession } from "@/lib/security/session-context";
import "./globals.css";
import "./productization.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://positionguard.online"),
  applicationName: "PositionGuard",
  title: { default: "PositionGuard", template: "%s · PositionGuard" },
  description:
    "An autonomous defense layer for Aave V3 borrowing positions that computes, constrains, executes, and verifies the Minimum Effective Intervention.",
  icons: {
    icon: [{ url: "/positionguard-mark.png", type: "image/png" }],
    apple: [{ url: "/positionguard-mark.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "PositionGuard",
    title: "PositionGuard",
    description:
      "Autonomous Aave V3 position defense through deterministic Minimum Effective Intervention and verified KeeperHub execution.",
    url: "/",
    images: [
      {
        url: "/positionguard-logo.png",
        width: 1350,
        height: 360,
        alt: "PositionGuard — Autonomous Defense",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PositionGuard",
    description:
      "Autonomous Aave V3 position defense through deterministic Minimum Effective Intervention and verified KeeperHub execution.",
    images: ["/positionguard-logo.png"],
  },
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
