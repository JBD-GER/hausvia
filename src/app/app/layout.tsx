import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "Kalender / Heute", href: "/app/today", icon: "today" },
  { label: "Immobilien", href: "/app/properties", icon: "properties" },
  { label: "Arbeitszeiten", href: "/app/time", icon: "working-times" },
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
      homeHref="/app/today"
      notificationsHref="/app/notifications"
      settingsHref="/app/profile"
    >
      {children}
    </PortalShell>
  );
}
