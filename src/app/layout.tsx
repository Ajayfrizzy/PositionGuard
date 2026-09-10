import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
export const metadata: Metadata = { title: { default: "PositionGuard", template: "%s · PositionGuard" }, description: "Autonomous Aave position defense through Minimum Effective Intervention" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AppShell>{children}</AppShell></body></html>; }
