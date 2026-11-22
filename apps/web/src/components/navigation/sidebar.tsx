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
      <Link href="/" onClick={onNavigate} aria-label="InternCalling home" className="mb-10 rounded-control">
        <BrandLogo />
      </Link>
      <nav aria-label="Workspace navigation" className="space-y-1">
        {items.map((item) => {
          const active = activePath === item.href || activePath.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={`group flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium ${active ? "bg-primary font-semibold text-on-primary" : "text-muted hover:bg-elevated/60 hover:text-foreground"}`}>
              <Icon name={item.icon} className={active ? "text-on-primary" : "opacity-75"} />
              <span>{item.label}</span>
              {active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-on-primary" />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-5">
        {account ?? <Link href="/sign-in" className="text-sm text-accent">Sign in</Link>}
        <Link href="/" onClick={onNavigate} className="mt-4 inline-flex min-h-10 items-center rounded-control text-xs text-muted hover:text-foreground">About InternCalling</Link>
      </div>
    </div>
  );
}
