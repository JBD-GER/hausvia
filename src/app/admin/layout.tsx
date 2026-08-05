import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "Kunden", href: "/admin/customers", icon: "customers" },
  { label: "Angebote", href: "/admin/offers", icon: "offers" },
  { label: "Mitarbeiter", href: "/admin/employees", icon: "employees" },
  { label: "Immobilien", href: "/admin/properties", icon: "properties" },
  {
    label: "Winterdienst",
    href: "/admin/winter-service",
    icon: "winter-service",
  },
  { label: "Equipment", href: "/admin/equipment", icon: "equipment" },
] satisfies PortalNavItem[];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile(["admin"]);
  return (
    <PortalShell
      profile={profile}
      title="Adminportal"
      navItems={navItems}
      homeHref="/admin/properties"
      notificationsHref="/admin/notifications"
      settingsHref="/admin/settings"
    >
      {children}
    </PortalShell>
  );
}
