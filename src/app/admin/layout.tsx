import { PortalShell } from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "Dashboard", href: "/admin" },
  { label: "Leads", href: "/admin/leads" },
  { label: "Kunden", href: "/admin/customers" },
  { label: "Mitarbeiter", href: "/admin/employees" },
  { label: "Projekte", href: "/admin/projects" },
  { label: "Schichten", href: "/admin/shifts" },
  { label: "Material", href: "/admin/orders" },
  { label: "Angebote", href: "/admin/offers" },
  { label: "Rechnungen", href: "/admin/invoices" },
  { label: "Dokumente", href: "/admin/documents" },
  { label: "Einladungen", href: "/admin/invitations" },
  { label: "Einstellungen", href: "/admin/settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["admin"]);
  return (
    <PortalShell profile={profile} title="Adminbereich" navItems={navItems}>
      {children}
    </PortalShell>
  );
}
