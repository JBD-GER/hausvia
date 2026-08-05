"use client";

import Link from "next/link";
import {
  Bell,
  Building2,
  CalendarDays,
  Clock,
  FileText,
  LogOut,
  Package,
  Settings,
  Snowflake,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import type { UserProfile } from "@/lib/supabase/types";

export type PortalNavIcon =
  | "customers"
  | "offers"
  | "employees"
  | "properties"
  | "winter-service"
  | "equipment"
  | "today"
  | "working-times";

export type PortalNavItem = {
  label: string;
  href: string;
  icon: PortalNavIcon;
};

const roleLabels: Record<UserProfile["role"], string> = {
  admin: "Admin",
  employee: "Mitarbeiter",
  customer: "Kunde",
};

const navIcons: Record<PortalNavIcon, LucideIcon> = {
  customers: Users,
  offers: FileText,
  employees: UserRound,
  properties: Building2,
  "winter-service": Snowflake,
  equipment: Package,
  today: CalendarDays,
  "working-times": Clock,
};

function pathFromHref(href: string) {
  return href.split(/[?#]/, 1)[0] || "/";
}

function activeNavHref(pathname: string, navItems: PortalNavItem[]) {
  const matches = navItems.filter((item) => {
    const itemPath = pathFromHref(item.href);
    return pathname === itemPath || (itemPath !== "/" && pathname.startsWith(`${itemPath}/`));
  });

  return matches.sort((left, right) => pathFromHref(right.href).length - pathFromHref(left.href).length)[0]?.href;
}

function NavLink({ item, active, mobile = false }: { item: PortalNavItem; active: boolean; mobile?: boolean }) {
  const Icon = navIcons[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={
        mobile
          ? [
              "mx-auto flex w-full max-w-32 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-extrabold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-brand",
            ].join(" ")
          : [
              "inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              active ? "bg-brand text-white shadow-sm" : "text-slate-650 hover:bg-brand-soft hover:text-brand",
            ].join(" ")
      }
    >
      <Icon aria-hidden="true" size={mobile ? 20 : 17} strokeWidth={2.2} />
      <span className={mobile ? "max-w-full truncate" : undefined}>{item.label}</span>
    </Link>
  );
}

export function PortalShell({
  profile,
  title,
  navItems,
  homeHref,
  notificationsHref,
  settingsHref,
  children,
}: {
  profile: UserProfile;
  title: string;
  navItems: PortalNavItem[];
  homeHref: string;
  notificationsHref: string;
  settingsHref?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname, navItems);
  const displayName = profile.full_name || profile.email;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
            <Logo compact href={homeHref} />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-extrabold text-slate-950 sm:text-base">{title}</p>
              <p className="truncate text-xs font-semibold text-slate-500">
                {displayName} · {roleLabels[profile.role]}
              </p>
            </div>
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-2 lg:flex" aria-label={`${title} Hauptnavigation`}>
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} active={item.href === activeHref} />
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href={notificationsHref}
              aria-label="Benachrichtigungen öffnen"
              title="Benachrichtigungen"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-brand/30 hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Bell aria-hidden="true" size={20} />
            </Link>

            <details className="group relative">
              <summary
                className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-brand/30 hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                aria-label="Profilmenü öffnen"
                title="Profilmenü"
              >
                <UserRound aria-hidden="true" size={20} />
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="border-b border-slate-100 px-2 pb-3">
                  <p className="truncate text-sm font-extrabold text-slate-950">{displayName}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                    {profile.email} · {roleLabels[profile.role]}
                  </p>
                </div>

                <div className="mt-2 grid gap-1">
                  <Link
                    href={homeHref}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Building2 aria-hidden="true" size={18} />
                    Zur Portalübersicht
                  </Link>
                  {settingsHref ? (
                    <Link
                      href={settingsHref}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Settings aria-hidden="true" size={18} />
                      Profil und Einstellungen
                    </Link>
                  ) : null}
                  <form action={logoutAction}>
                    <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                      <LogOut aria-hidden="true" size={18} />
                      Abmelden
                    </button>
                  </form>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 sm:py-6 lg:px-8 lg:pb-8">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur [padding-bottom:max(env(safe-area-inset-bottom),0.5rem)] lg:hidden"
        aria-label={`${title} mobile Hauptnavigation`}
      >
        <div
          className="mx-auto grid max-w-xl gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(navItems.length, 1)}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} active={item.href === activeHref} mobile />
          ))}
        </div>
      </nav>
    </div>
  );
}
