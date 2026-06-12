"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import type { UserProfile } from "@/lib/supabase/types";

export type PortalNavItem = {
  label: string;
  href: string;
};

const roleLabels: Record<UserProfile["role"], string> = {
  admin: "Admin",
  employee: "Mitarbeiter",
  customer: "Kunde",
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function PortalShell({
  profile,
  title,
  navItems,
  children,
}: {
  profile: UserProfile;
  title: string;
  navItems: PortalNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const homeHref = navItems[0]?.href ?? "/";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
            <Logo compact href={homeHref} />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-950 sm:text-base">{title}</p>
              <p className="truncate text-xs font-semibold text-slate-500">
                {profile.full_name || profile.email} · {roleLabels[profile.role]}
              </p>
            </div>
          </div>

          <nav
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 lg:flex"
            aria-label={title}
          >
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold transition",
                    active
                      ? "bg-brand text-white shadow-sm"
                      : "text-slate-650 hover:bg-brand-soft hover:text-brand",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <form action={logoutAction}>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 transition hover:border-brand hover:text-brand">
                Logout
              </button>
            </form>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-900 shadow-sm lg:hidden"
            aria-label={open ? "Portal-Menü schließen" : "Portal-Menü öffnen"}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-sm lg:hidden">
            <nav className="mx-auto grid max-w-7xl gap-2" aria-label={title}>
              {navItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "rounded-md px-3 py-3 text-sm font-extrabold transition",
                      active ? "bg-brand text-white" : "bg-slate-50 text-slate-800 hover:bg-brand-soft hover:text-brand",
                    ].join(" ")}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <form action={logoutAction} className="pt-2">
                <button className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-extrabold text-slate-800">
                  Logout
                </button>
              </form>
            </nav>
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
