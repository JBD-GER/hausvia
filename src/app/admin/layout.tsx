import type { Metadata } from "next";
import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adminportal | Hausvia",
  robots: { index: false, follow: false },
};

const navItems = [
  { label: "Übersicht", href: "/admin", icon: "dashboard", group: "Übersicht", mobile: true },
  { label: "Immobilien", href: "/admin/properties", icon: "properties", group: "Verwaltung", mobile: true, matchPaths: ["/admin/buildings"] },
  { label: "Kunden", href: "/admin/customers", icon: "customers", group: "Verwaltung" },
  { label: "Mitarbeiter", href: "/admin/employees", icon: "employees", group: "Verwaltung" },
  { label: "Leads", href: "/admin/leads", icon: "leads", group: "Vertrieb" },
  { label: "Angebote", href: "/admin/offers", icon: "offers", group: "Vertrieb", mobile: true },
  { label: "Rechnungen", href: "/admin/invoices", icon: "invoices", group: "Vertrieb" },
  { label: "Projekte", href: "/admin/projects", icon: "projects", group: "Betrieb" },
  {
    label: "Winterdienst",
    href: "/admin/winter-service",
    icon: "winter-service",
    group: "Betrieb",
  },
  { label: "Equipment", href: "/admin/equipment", icon: "equipment", group: "Betrieb" },
  { label: "Material", href: "/admin/orders", icon: "material", group: "Betrieb" },
  { label: "Arbeitszeiten", href: "/admin/shifts", icon: "shifts", group: "Betrieb" },
  { label: "Dokumente", href: "/admin/documents", icon: "documents", group: "Organisation" },
  { label: "Einladungen", href: "/admin/invitations", icon: "invitations", group: "Organisation" },
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
      homeHref="/admin"
      notificationsHref="/admin/notifications"
      settingsHref="/admin/settings"
    >
      {children}
    </PortalShell>
  );
}
