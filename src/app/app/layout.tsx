import { PortalShell } from "@/components/portal/PortalShell";
import { requireProfile } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

const navItems = [
  { label: "Heute", href: "/app" },
  { label: "Einsätze", href: "/app/today" },
  { label: "Kunden", href: "/app/customers" },
  { label: "Projekte", href: "/app/projects" },
  { label: "Schichten", href: "/app/shifts" },
  { label: "Material", href: "/app/orders" },
];

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["employee"]);
  return (
    <PortalShell profile={profile} title="Mitarbeiterportal" navItems={navItems}>
      {children}
    </PortalShell>
  );
}
