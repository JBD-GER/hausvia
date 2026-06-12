import { PortalShell } from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "Übersicht", href: "/portal" },
  { label: "Anfrage", href: "/portal/request" },
  { label: "Angebote", href: "/portal/offers" },
  { label: "Betreuung", href: "/portal/care" },
  { label: "Rechnungen", href: "/portal/invoices" },
];

export default async function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["customer"]);
  return (
    <PortalShell profile={profile} title="Kundenportal" navItems={navItems}>
      {children}
    </PortalShell>
  );
}
