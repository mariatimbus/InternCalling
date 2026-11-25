import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Icon, type IconName } from "@/components/ui/icon";

export type NavigationItem = { href: string; label: string; icon: IconName };
export type SidebarProps = { items: readonly NavigationItem[]; activePath: string; onNavigate?: () => void; account?: ReactNode };

/** Persistent semantic navigation. The route layout supplies real destinations. */
export function Sidebar({ items, activePath, onNavigate, account }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} aria-label="InternCalling home" className="mb-9 rounded-control px-2">
        <BrandLogo />
      </Link>
      <nav aria-label="Workspace navigation" className="space-y-1.5">
        {items.map((item) => {
          const active = activePath === item.href || activePath.startsWith(`${item.href}/`)
            || (item.href === "/jobs" && activePath.startsWith("/opportunities/"));
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={`group flex min-h-12 items-center gap-3 rounded-control px-3 py-3 text-sm font-medium motion-safe:transition-colors ${active ? "bg-primary font-semibold text-on-primary" : "text-muted hover:bg-elevated hover:text-foreground"}`}>
              <Icon name={item.icon} className={active ? "text-on-primary" : "text-muted"} />
              <span>{item.label}</span>
              {active && <Icon name="chevron" className="ms-auto size-3.5" />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-8">
        <div className="rounded-control border border-line bg-elevated/50 p-3">{account ?? <Link href="/sign-in" className="text-sm text-accent">Sign in</Link>}</div>
        <Link href="/" onClick={onNavigate} className="mt-4 inline-flex min-h-10 items-center rounded-control text-xs text-muted hover:text-foreground">About InternCalling</Link>
      </div>
    </div>
  );
}
