import Link from "next/link";
import { ArrowRight, PackagePlus } from "lucide-react";
import { PageHeader, buttonClass } from "@/components/portal/PortalUI";
import { requireProfile } from "@/lib/supabase/auth";

export default async function EmployeeOrdersPage() {
  await requireProfile(["employee"]);

  return (
    <>
      <PageHeader
        eyebrow="Material"
        title="Material melden"
        text="Bedarf und Defekte gehören direkt zum jeweiligen Einsatz."
        icon={<PackagePlus aria-hidden="true" size={20} />}
        compact
      />
      <section className="rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-soft to-white p-5 shadow-sm">
        <span className="grid size-12 place-items-center rounded-2xl bg-white text-brand shadow-sm">
          <PackagePlus aria-hidden="true" size={23} />
        </span>
        <h2 className="mt-4 text-xl font-black text-slate-950">Einsatz auswählen</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Öffnen Sie den passenden Termin und erfassen Sie die Meldung dort. So sind Immobilie, Gebäude und Equipment automatisch richtig zugeordnet.
        </p>
        <Link href="/app/today" className={`${buttonClass} mt-4`}>
          Einsätze öffnen <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    </>
  );
}
