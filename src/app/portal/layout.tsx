import type { Metadata } from "next";
import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kundenportal | Hausvia",
  robots: { index: false, follow: false },
};

const navItems = [
  { label: "Übersicht", href: "/portal", icon: "dashboard", group: "Übersicht", mobile: true },
  { label: "Immobilien", href: "/portal/properties", icon: "properties", group: "Meine Objekte", mobile: true },
  { label: "Betreuung", href: "/portal/care", icon: "care", group: "Meine Objekte" },
  { label: "Angebote", href: "/portal/offers", icon: "offers", group: "Dokumente", mobile: true },
  { label: "Rechnungen", href: "/portal/invoices", icon: "invoices", group: "Dokumente" },
  { label: "Meine Anfrage", href: "/portal/request", icon: "request", group: "Service" },
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
      homeHref="/portal"
      notificationsHref="/portal/notifications"
      settingsHref="/portal/profile"
    >
      {children}
    </PortalShell>
  );
}
