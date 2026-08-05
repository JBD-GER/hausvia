import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "Immobilien", href: "/portal/properties", icon: "properties" },
  { label: "Angebote", href: "/portal/offers", icon: "offers" },
] satisfies PortalNavItem[];

export default async function CustomerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile(["customer"]);
  return (
    <PortalShell
      profile={profile}
      title="Kundenportal"
      navItems={navItems}
      homeHref="/portal/properties"
      notificationsHref="/portal/notifications"
      settingsHref="/portal/profile"
    >
      {children}
    </PortalShell>
  );
}
