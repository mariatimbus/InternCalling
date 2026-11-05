"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type NavigationItem } from "@/components/navigation/sidebar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { BrandLogo } from "@/components/brand/brand-logo";

export type AppShellProps = { children: ReactNode; navigation: readonly NavigationItem[]; notice?: ReactNode };

/** Shared product frame. Authentication and product data belong to the calling route layout. */
export function AppShell({ children, navigation, notice }: AppShellProps) {
  const pathname = usePathname();
  const active = navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const [navigationOpen, setNavigationOpen] = useState(false);
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden lg:flex-row lg:gap-3 lg:p-3 xl:gap-5 xl:p-5">
      <aside className="hidden w-52 shrink-0 rounded-panel bg-surface/60 px-4 py-6 lg:block xl:w-56">
        <Sidebar items={navigation} activePath={pathname} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2 lg:min-h-14 lg:px-7">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button variant="ghost" className="lg:hidden" aria-expanded={navigationOpen} aria-controls="workspace-navigation" onClick={() => setNavigationOpen(true)}><Icon name="menu" /><span className="sr-only">Menu</span></Button>
            <span className="lg:hidden"><BrandLogo /></span>
            <div className="hidden items-center gap-2 text-xs text-muted lg:flex"><span>Workspace</span><Icon name="chevron" className="size-3 opacity-60" /><span className="text-foreground">{active?.label ?? "Components"}</span></div>
          </div>
          {notice && <details className="group">
            <summary aria-label="About demo workspace" className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-control px-2 text-xs text-muted hover:text-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" /><span className="hidden sm:inline">Demo workspace</span><span className="sm:hidden">Demo</span>
            </summary>
            <div className="absolute top-full right-4 z-30 mt-2 max-w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-4 text-sm leading-relaxed text-muted">{notice}</div>
          </details>}
        </header>
        <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <Drawer id="workspace-navigation" open={navigationOpen} onClose={() => setNavigationOpen(false)} title="Navigation" closeAt="(min-width: 1024px)">
        <Sidebar items={navigation} activePath={pathname} onNavigate={() => setNavigationOpen(false)} />
      </Drawer>
    </div>
  );
}
