import Link from "next/link";
import { PageHeader, Panel, buttonClass } from "@/components/portal/PortalUI";
import { requireProfile } from "@/lib/supabase/auth";

export default async function EmployeeOrdersPage() {
  await requireProfile(["employee"]);

  return (
    <>
      <PageHeader
        eyebrow="Material"
        title="Material und Equipment melden"
        text="Materialbedarf, leere Verbrauchsmittel und defektes Equipment werden direkt am aktuellen Einsatz dokumentiert."
      />
      <Panel title="Aktueller Ablauf">
        <p className="text-sm leading-6 text-slate-700">
          Öffnen Sie den geplanten Einsatz und erstellen Sie dort eine betriebliche Meldung. Gebäude und
          Equipment lassen sich eindeutig zuordnen; die Meldung bleibt ausschließlich im Adminbereich sichtbar.
        </p>
        <Link href="/app/today" className={`${buttonClass} mt-4`}>
          Einsätze öffnen
        </Link>
      </Panel>
    </>
  );
}
