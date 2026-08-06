"use client";

import Link from "next/link";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock,
  FileArchive,
  FileText,
  HandCoins,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquarePlus,
  Package,
  ReceiptText,
  Settings,
  Snowflake,
  Sparkles,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import type { UserProfile } from "@/lib/supabase/types";

export type PortalNavIcon =
  | "dashboard"
  | "customers"
  | "offers"
  | "employees"
  | "properties"
  | "winter-service"
  | "equipment"
  | "today"
  | "working-times"
  | "leads"
  | "invoices"
  | "documents"
  | "invitations"
  | "projects"
  | "material"
  | "shifts"
  | "care"
  | "request";

export type PortalNavItem = {
  label: string;
  href: string;
  icon: PortalNavIcon;
  group?: string;
  mobile?: boolean;
  description?: string;
  matchPaths?: string[];
};

const roleLabels: Record<UserProfile["role"], string> = {
  admin: "Administration",
  employee: "Mitarbeiter-App",
  customer: "Kundenportal",
};

const navIcons: Record<PortalNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  offers: FileText,
  employees: UserRound,
  properties: Building2,
  "winter-service": Snowflake,
  equipment: Wrench,
  today: CalendarDays,
  "working-times": Clock,
  leads: HandCoins,
  invoices: ReceiptText,
  documents: FileArchive,
  invitations: MessageSquarePlus,
  projects: BriefcaseBusiness,
  material: Package,
  shifts: CalendarCheck2,
  care: ClipboardList,
  request: CircleDollarSign,
};

function pathFromHref(href: string) {
  return href.split(/[?#]/, 1)[0] || "/";
}

function activeNavHref(pathname: string, navItems: PortalNavItem[]) {
  const matches = navItems.flatMap((item) =>
    [item.href, ...(item.matchPaths ?? [])].flatMap((href) => {
      const itemPath = pathFromHref(href);
      const isPortalRoot = itemPath.split("/").filter(Boolean).length === 1;
      const matchesPath =
        pathname === itemPath ||
        (!isPortalRoot && itemPath !== "/" && pathname.startsWith(`${itemPath}/`));
      return matchesPath ? [{ href: item.href, matchedLength: itemPath.length }] : [];
    }),
  );

  return matches.sort((left, right) => right.matchedLength - left.matchedLength)[0]?.href;
}

function initialsFromProfile(profile: UserProfile) {
  const source = profile.full_name?.trim() || profile.email.split("@")[0] || "HV";
  const parts = source.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "H"}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function groupNavigation(navItems: PortalNavItem[]) {
  const groups = new Map<string, PortalNavItem[]>();

  for (const item of navItems) {
    const group = item.group || "Navigation";
    const entries = groups.get(group) ?? [];
    entries.push(item);
    groups.set(group, entries);
  }

  return Array.from(groups.entries());
}

function DesktopNavLink({ item, active }: { item: PortalNavItem; active: boolean }) {
  const Icon = navIcons[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
        active
          ? "bg-white text-brand shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
          : "text-white/72 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition",
          active ? "bg-[#e7f8f9] text-[#087f83]" : "bg-white/8 text-white/82 group-hover:bg-white/12",
        ].join(" ")}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <ChevronRight
        aria-hidden="true"
        size={15}
        className={active ? "text-brand/55" : "translate-x-0 text-white/0 transition group-hover:translate-x-0.5 group-hover:text-white/45"}
      />
    </Link>
  );
}

function MobileTab({ item, active, onNavigate }: { item: PortalNavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = navIcons[item.icon];

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex min-h-[3.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-extrabold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active ? "text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-brand",
      ].join(" ")}
    >
      {active ? <span aria-hidden="true" className="absolute inset-x-4 -top-2 h-0.5 rounded-full bg-[#0aa6a6]" /> : null}
      <span className={active ? "grid h-7 w-9 place-items-center rounded-lg bg-[#e7f8f9]" : "grid h-7 w-9 place-items-center"}>
        <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.5 : 2.15} />
      </span>
      <span className="max-w-full truncate">{item.label}</span>
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreMobileMenuFocusRef = useRef(true);
  const routeAnnouncementRef = useRef<HTMLParagraphElement>(null);
  const activeHref = activeNavHref(pathname, navItems);
  const displayName = profile.full_name || profile.email;
  const groupedNavItems = groupNavigation(navItems);
  const primaryMobileItems = navItems.filter((item) => item.mobile).slice(0, 3);
  const currentItem = navItems.find((item) => item.href === activeHref);
  const utilityTitle =
    pathname === notificationsHref
      ? "Benachrichtigungen"
      : settingsHref && (pathname === settingsHref || pathname.startsWith(`${settingsHref}/`))
        ? profile.role === "admin"
          ? "Einstellungen"
          : "Profil"
        : null;
  const currentPageTitle = currentItem?.label ?? utilityTitle ?? title;
  const moreIsActive = Boolean(
    (activeHref && !primaryMobileItems.some((item) => item.href === activeHref)) ||
      pathname === notificationsHref ||
      (settingsHref && pathname === settingsHref),
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = mobileMenuRef.current;
    const menuTrigger = mobileMenuTriggerRef.current;

    document.body.style.overflow = "hidden";
    const focusable = menu
      ? Array.from(
          menu.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];
    (focusable[0] ?? menu)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }

      if (event.key !== "Tab" || !menu) return;
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);

      if (event.shiftKey && (document.activeElement === first || document.activeElement === menu)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreMobileMenuFocusRef.current) {
        (previousFocus ?? menuTrigger)?.focus();
      }
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const content = document.querySelector<HTMLElement>("#portal-main-content");
    if (!content) return;

    let titleFrame = 0;
    let announcementFrame = 0;
    let lastTitle = "";

    const updateTitle = () => {
      window.cancelAnimationFrame(titleFrame);
      titleFrame = window.requestAnimationFrame(() => {
        const contentHeading = content.querySelector<HTMLElement>("h1")?.innerText.trim();
        const nextTitle = contentHeading || currentPageTitle;
        document.title = `${nextTitle} | Hausvia`;
        if (nextTitle !== lastTitle && routeAnnouncementRef.current) {
          lastTitle = nextTitle;
          routeAnnouncementRef.current.textContent = "";
          window.cancelAnimationFrame(announcementFrame);
          announcementFrame = window.requestAnimationFrame(() => {
            if (routeAnnouncementRef.current) {
              routeAnnouncementRef.current.textContent = `Seite geladen: ${nextTitle}`;
            }
          });
        }
      });
    };

    const observer = new MutationObserver(updateTitle);
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    updateTitle();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(titleFrame);
      window.cancelAnimationFrame(announcementFrame);
    };
  }, [currentPageTitle, pathname]);

  return (
    <div className="portal-app min-h-screen bg-[#f3f6fa] text-slate-900">
      <a
        href="#portal-main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-xl bg-white px-4 py-3 text-sm font-black text-brand shadow-xl ring-2 ring-brand transition focus:translate-y-0 focus:outline-none"
      >
        Zum Inhalt springen
      </a>
      <p ref={routeAnnouncementRef} aria-live="polite" aria-atomic="true" className="sr-only" />
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col overflow-hidden bg-[linear-gradient(165deg,#082b61_0%,#061f47_52%,#04142f_100%)] text-white shadow-[16px_0_50px_rgba(4,20,47,0.12)] lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#0aa6a6]/16 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-28 h-72 w-72 rounded-full bg-[#f5c542]/10 blur-3xl" />

        <div className="relative px-5 pb-4 pt-5">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
            <Logo href={homeHref} />
          </div>
          <div className="mt-4 flex items-center gap-2 px-1">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0aa6a6] text-white shadow-sm">
              <Sparkles aria-hidden="true" size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-white/92">{roleLabels[profile.role]}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-white/70">Digital. Zuverlässig. Vor Ort.</p>
            </div>
          </div>
        </div>

        <nav className="portal-sidebar-scroll relative flex-1 overflow-y-auto px-4 pb-4" aria-label={`${title} Hauptnavigation`}>
          <div className="space-y-5">
            {groupedNavItems.map(([group, items]) => (
              <section key={group} aria-labelledby={`portal-nav-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <p
                  id={`portal-nav-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/65"
                >
                  {group}
                </p>
                <div className="grid gap-1">
                  {items.map((item) => (
                    <DesktopNavLink key={item.href} item={item} active={item.href === activeHref} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="relative border-t border-white/10 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0aa6a6] text-xs font-black text-white shadow-md">
                {initialsFromProfile(profile)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-white">{displayName}</p>
                <p className="truncate text-[11px] font-semibold text-white/72">{profile.email}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {settingsHref ? (
                <Link
                  href={settingsHref}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-2 text-xs font-bold text-white/82 transition hover:bg-white/16 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <Settings aria-hidden="true" size={15} />
                  Profil
                </Link>
              ) : (
                <Link
                  href={homeHref}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-2 text-xs font-bold text-white/82 transition hover:bg-white/16 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <Home aria-hidden="true" size={15} />
                  Start
                </Link>
              )}
              <form action={logoutAction}>
                <button className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-2 text-xs font-bold text-white/82 transition hover:bg-red-400/18 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
                  <LogOut aria-hidden="true" size={15} />
                  Abmelden
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-[#dfe7f0]/90 bg-white/88 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:min-h-[4.75rem] lg:px-8 xl:px-10">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(4,20,47,0.10)] ring-1 ring-slate-200 lg:hidden">
                <Logo compact href={homeHref} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[10px] font-black uppercase tracking-[0.15em] text-[#087f83] sm:text-[11px]">
                    {roleLabels[profile.role]}
                  </p>
                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                  <p className="hidden truncate text-[11px] font-bold text-slate-500 sm:block">{title}</p>
                </div>
                <p className="truncate text-base font-black tracking-[-0.02em] text-[#071c3e] sm:text-lg lg:text-xl">
                  {currentPageTitle}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={notificationsHref}
                aria-label="Benachrichtigungen öffnen"
                title="Benachrichtigungen"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe7f0] bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0aa6a6]/35 hover:text-brand hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Bell aria-hidden="true" size={19} strokeWidth={2.25} />
              </Link>
              {settingsHref ? (
                <Link
                  href={settingsHref}
                  aria-label="Profil und Einstellungen öffnen"
                  title="Profil und Einstellungen"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(145deg,#0aa6a6,#087f83)] text-xs font-black text-white shadow-[0_7px_18px_rgba(10,166,166,0.25)] transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  {initialsFromProfile(profile)}
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <main
          id="portal-main-content"
          tabIndex={-1}
          className="portal-content relative px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:px-8 lg:pb-10 lg:pt-8 xl:px-10"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-80 overflow-hidden">
            <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#0aa6a6]/[0.06] blur-3xl" />
            <div className="absolute left-1/3 top-4 h-48 w-48 rounded-full bg-[#082b61]/[0.035] blur-3xl" />
          </div>
          <div className="relative z-10 mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe7f0] bg-white/94 px-2 pt-1.5 shadow-[0_-12px_32px_rgba(4,20,47,0.10)] backdrop-blur-xl [padding-bottom:max(env(safe-area-inset-bottom),0.45rem)] lg:hidden"
        aria-label={`${title} mobile Hauptnavigation`}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {primaryMobileItems.map((item) => (
            <MobileTab key={item.href} item={item} active={item.href === activeHref} />
          ))}
          <button
            ref={mobileMenuTriggerRef}
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="portal-mobile-menu"
            onClick={() => {
              restoreMobileMenuFocusRef.current = true;
              setMobileMenuOpen(true);
            }}
            className={[
              "relative flex min-h-[3.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-extrabold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              moreIsActive || mobileMenuOpen ? "text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-brand",
            ].join(" ")}
          >
            {moreIsActive || mobileMenuOpen ? <span aria-hidden="true" className="absolute inset-x-4 -top-2 h-0.5 rounded-full bg-[#0aa6a6]" /> : null}
            <span className={moreIsActive || mobileMenuOpen ? "grid h-7 w-9 place-items-center rounded-lg bg-[#e7f8f9]" : "grid h-7 w-9 place-items-center"}>
              <Menu aria-hidden="true" size={20} strokeWidth={2.25} />
            </span>
            <span>Mehr</span>
          </button>
        </div>
      </nav>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Menü schließen"
            className="portal-menu-backdrop absolute inset-0 bg-[#04142f]/58 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            ref={mobileMenuRef}
            id="portal-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="portal-mobile-menu-title"
            tabIndex={-1}
            className="portal-mobile-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] bg-white px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 shadow-[0_-24px_70px_rgba(4,20,47,0.28)] outline-none"
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-11 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#087f83]">{roleLabels[profile.role]}</p>
                <h2 id="portal-mobile-menu-title" className="mt-0.5 text-xl font-black tracking-[-0.025em] text-[#071c3e]">
                  Alle Bereiche
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Menü schließen"
                className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </div>

            <div className="space-y-5 py-5">
              {groupedNavItems.map(([group, items]) => (
                <section key={group}>
                  <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">{group}</p>
                  <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    {items.map((item) => {
                      const Icon = navIcons[item.icon];
                      const active = item.href === activeHref;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            restoreMobileMenuFocusRef.current = false;
                            setMobileMenuOpen(false);
                          }}
                          aria-current={active ? "page" : undefined}
                          className={[
                            "flex min-h-[4.6rem] items-center gap-3 rounded-2xl border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                            active
                              ? "border-[#0aa6a6]/30 bg-[#e7f8f9] text-brand shadow-sm"
                              : "border-[#e5ebf2] bg-white text-slate-700 shadow-[0_5px_16px_rgba(4,20,47,0.045)] hover:border-[#0aa6a6]/25 hover:bg-[#f8fbfc]",
                          ].join(" ")}
                        >
                          <span className={active ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#087f83] shadow-sm" : "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"}>
                            <Icon aria-hidden="true" size={20} />
                          </span>
                          <span className="min-w-0 flex-1 break-words text-[13px] font-extrabold leading-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="border-t border-slate-100 pb-2 pt-4">
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#f3f6fa] p-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#0aa6a6,#087f83)] text-xs font-black text-white">
                  {initialsFromProfile(profile)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[#071c3e]">{displayName}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{profile.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={notificationsHref}
                  onClick={() => {
                    restoreMobileMenuFocusRef.current = false;
                    setMobileMenuOpen(false);
                  }}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#dfe7f0] bg-white px-3 text-sm font-extrabold text-slate-700 transition hover:border-[#0aa6a6]/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Bell aria-hidden="true" size={18} />
                  Meldungen
                </Link>
                {settingsHref ? (
                  <Link
                    href={settingsHref}
                    onClick={() => {
                      restoreMobileMenuFocusRef.current = false;
                      setMobileMenuOpen(false);
                    }}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#dfe7f0] bg-white px-3 text-sm font-extrabold text-slate-700 transition hover:border-[#0aa6a6]/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Settings aria-hidden="true" size={18} />
                    Profil
                  </Link>
                ) : null}
              </div>
              <form action={logoutAction} className="mt-2">
                <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3 text-sm font-extrabold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                  <LogOut aria-hidden="true" size={18} />
                  Sicher abmelden
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
