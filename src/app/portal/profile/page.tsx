import { Mail, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader, StatusPill } from "@/components/portal/PortalUI";
import { requireCustomerContext } from "@/lib/portal/access";

export default async function CustomerProfilePage() {
  const { profile, customer } = await requireCustomerContext();
  const row = Array.isArray(customer) ? customer[0] : customer;
  const displayName = row?.company_name || row?.contact_name || profile.full_name;

  return (
    <>
      <PageHeader
        eyebrow="Profil"
        title={displayName}
        text="Ihre persönlichen Zugangsdaten zum Kundenportal."
        icon={<UserRound aria-hidden="true" size={20} />}
        compact
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-100 p-4 sm:p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-lg font-black text-brand">
            {displayName?.slice(0, 1).toUpperCase() || "H"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-slate-950">{displayName}</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
              <Mail aria-hidden="true" size={15} /> {profile.email}
            </p>
          </div>
          <StatusPill tone="success">Aktiv</StatusPill>
        </div>
        <div className="flex items-start gap-3 p-4 text-sm text-slate-600 sm:p-5">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-brand" size={19} />
          <p>
            Rolle: <strong className="text-slate-900">Kunde</strong>. Ihre Daten und Dokumente sind nur nach Anmeldung sichtbar.
          </p>
        </div>
      </section>
    </>
  );
}
