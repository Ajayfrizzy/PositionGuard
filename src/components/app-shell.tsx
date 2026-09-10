"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, ShieldMark } from "./icons";
import { shortAddress } from "@/lib/product/format";

const nav = [["/dashboard", "Overview", "grid"], ["/position", "Position", "position"], ["/protection", "Protection", "shield"], ["/activity", "Activity", "activity"], ["/settings", "Settings", "settings"]] as const;
export function AppShell({ children, protectedWallet, protectionAttention }: { children: React.ReactNode; protectedWallet: string | null; protectionAttention: boolean }) {
  const path = usePathname();
  if (path.startsWith("/dev/")) return <>{children}</>;
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><ShieldMark className="brand-mark"/><span><strong>PositionGuard</strong><small>Autonomous Defense</small></span></Link>
      <nav className="side-nav" aria-label="Primary navigation">{nav.map(([href, label, icon]) => <Link className={path === href || (path === "/" && href === "/dashboard") ? "active" : ""} href={href} key={href}><Icon name={icon}/><span>{label}</span>{label === "Protection" && protectionAttention && <span className="nav-alert" aria-label="Protection action available"/>}</Link>)}</nav>
      <div className="sidebar-status"><div className="status-heading"><span className="live-dot"/>System operational</div><p>Monitoring Base Sepolia</p><div className="network-chip"><span className="network-icon">◆</span><span><b>Base Sepolia</b><small>Chain ID 84532</small></span><em>TESTNET</em></div></div>
      <div className="sidebar-foot"><div className="avatar"><Icon name="shield"/></div><div><b>Protected Account</b><span title={protectedWallet ?? undefined}>{shortAddress(protectedWallet)}</span></div></div>
    </aside>
    <main className="app-main">{children}</main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(([href, label, icon]) => <Link className={path === href ? "active" : ""} href={href} key={href}><span className="mobile-nav-icon"><Icon name={icon}/>{label === "Protection" && protectionAttention && <span className="nav-alert" aria-label="Protection action available"/>}</span><span>{label}</span></Link>)}</nav>
  </div>;
}
