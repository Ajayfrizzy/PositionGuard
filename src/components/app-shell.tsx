"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, ShieldMark } from "./icons";

const nav = [["/dashboard", "Overview", "grid"], ["/position", "Position", "position"], ["/protection", "Protection", "shield"], ["/activity", "Activity", "activity"], ["/settings", "Settings", "settings"]] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/dev/")) return <>{children}</>;
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><ShieldMark className="brand-mark"/><span><strong>PositionGuard</strong><small>Autonomous Defense</small></span></Link>
      <nav className="side-nav" aria-label="Primary navigation">{nav.map(([href, label, icon]) => <Link className={path === href || (path === "/" && href === "/dashboard") ? "active" : ""} href={href} key={href}><Icon name={icon}/><span>{label}</span>{label === "Protection" && <i/>}</Link>)}</nav>
      <div className="sidebar-status"><div className="status-heading"><span className="live-dot"/>System operational</div><p>Monitoring Base Sepolia</p><div className="network-chip"><span className="network-icon">◆</span><span><b>Base Sepolia</b><small>Chain ID 84532</small></span><em>TESTNET</em></div></div>
      <div className="sidebar-foot"><div className="avatar">PG</div><div><b>Demo Operator</b><span>Protected account</span></div><button aria-label="Account menu">•••</button></div>
    </aside>
    <main className="app-main">{children}</main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(([href, label, icon]) => <Link className={path === href ? "active" : ""} href={href} key={href}><Icon name={icon}/><span>{label}</span></Link>)}</nav>
  </div>;
}
