import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { loadProductData } from "@/lib/product/data";
import "./globals.css";
export const metadata: Metadata = { title: { default: "PositionGuard", template: "%s · PositionGuard" }, description: "Autonomous Aave position defense through Minimum Effective Intervention" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const data = await loadProductData(); return <html lang="en"><body><AppShell protectedWallet={data.position.wallet} protectionAttention={data.protectionAttention}>{children}</AppShell></body></html>; }
