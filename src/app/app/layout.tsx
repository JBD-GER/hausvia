import type { Metadata } from "next";
import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mitarbeiter-App | Hausvia",
  robots: { index: false, follow: false },
};

const navItems = [
  { label: "Übersicht", href: "/app", icon: "dashboard", group: "Übersicht" },
  { label: "Heute", href: "/app/today", icon: "today", group: "Mein Arbeitstag", mobile: true, matchPaths: ["/app/visits"] },
  { label: "Immobilien", href: "/app/properties", icon: "properties", group: "Mein Arbeitstag", mobile: true },
  { label: "Arbeitszeiten", href: "/app/time", icon: "working-times", group: "Mein Arbeitstag", mobile: true },
  { label: "Kunden", href: "/app/customers", icon: "customers", group: "Weitere Bereiche" },
  { label: "Projekte", href: "/app/projects", icon: "projects", group: "Weitere Bereiche" },
  { label: "Material", href: "/app/orders", icon: "material", group: "Weitere Bereiche" },
  { label: "Schichten", href: "/app/shifts", icon: "shifts", group: "Weitere Bereiche" },
] satisfies PortalNavItem[];

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile(["employee"]);
  return (
    <PortalShell
      profile={profile}
      title="Mitarbeiterportal"
      navItems={navItems}
      homeHref="/app"
      notificationsHref="/app/notifications"
      settingsHref="/app/profile"
    >
      {children}
    </PortalShell>
  );
}
