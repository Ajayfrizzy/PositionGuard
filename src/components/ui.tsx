import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
export function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "danger" | "neutral" | "blue" }) { return <span data-slot="badge" className={cn("pill", `pill-${tone}`)}>{children}</span>; }
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) { return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="page-actions">{children}</div>}</header>; }
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section data-slot="card" className={cn("card", className)}>{children}</section>; }
export function Metric({ label, value, detail, className = "" }: { label: string; value: React.ReactNode; detail?: React.ReactNode; className?: string }) { return <div className={`metric ${className}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) { return <div className="empty"><div className="empty-icon"><Icon name="database"/></div><h3>{title}</h3><p>{children}</p></div>; }
export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link className="arrow-link" href={href}>{children}<Icon name="arrow"/></Link>; }
export function ConnectionDot({ state }: { state: "connected" | "disconnected" | "unknown" }) { return <span className={`connection-dot ${state}`} aria-label={state}/>; }
