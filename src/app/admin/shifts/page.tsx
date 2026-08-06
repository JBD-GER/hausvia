import { reviewShiftAction } from "@/app/actions/admin";
import { CompactSection, EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

export default async function AdminShiftsPage() {
  const { admin: supabase } = await requireAdminContext();
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id,status,started_at,ended_at,gross_minutes,break_minutes,net_minutes,notes,customer_visible,projects(name,object_address),employee_profiles(full_name)")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader eyebrow="Schichten" title="Zeiten prüfen" text="Eingereichte Schichten freigeben oder ablehnen. Kunden sehen nur geprüfte und freigegebene Einsätze." />
      <Panel title="Schichtliste">
        {shifts?.length ? (
          <div className="grid gap-4">
            {shifts.map((shift) => (
              <article key={shift.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-extrabold text-slate-950">
                      {asText(firstRelation(shift.projects)?.name)} · {asText(firstRelation(shift.employee_profiles)?.full_name)}
                    </p>
                    <p className="mt-1 text-sm text-slate-650">
                      {formatDateTime(shift.started_at)} bis {formatDateTime(shift.ended_at)}
                    </p>
                    <p className="mt-1 text-sm text-slate-650">
                      Brutto {shift.gross_minutes} Min · Pause {shift.break_minutes} Min · Netto {shift.net_minutes} Min
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{asText(shift.notes)}</p>
                  </div>
                  <StatusPill>{shift.status}</StatusPill>
                </div>
                <div className="mt-4">
                  <CompactSection title="Schicht prüfen" description="Entscheidung und interne Prüfnotiz">
                    <form action={reviewShiftAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <input type="hidden" name="shiftId" value={shift.id} />
                      <Field label="Entscheidung">
                        <select name="status" className={inputClass} defaultValue={shift.status}>
                          <option value="approved">Freigeben</option>
                          <option value="rejected">Ablehnen</option>
                          <option value="submitted">Zur Prüfung</option>
                        </select>
                      </Field>
                      <Field label="Prüfnotiz"><input name="reviewNote" className={inputClass} /></Field>
                      <button className={`${buttonClass} self-end`}>Speichern</button>
                    </form>
                  </CompactSection>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Schichten" text="Mitarbeiter-Schichten erscheinen nach Erfassung hier." />
        )}
      </Panel>
    </>
  );
}
