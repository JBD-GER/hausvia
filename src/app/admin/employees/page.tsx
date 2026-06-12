import { deactivateUserAction, inviteEmployeeAction } from "@/app/actions/admin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminEmployeesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: employees } = await supabase
    .from("employee_profiles")
    .select("id,user_id,status,full_name,email,phone,notes")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader eyebrow="Mitarbeiter" title="Mitarbeiter verwalten" text="Einladen, deaktivieren und später Projekten zuweisen." />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Mitarbeiter einladen">
          <form action={inviteEmployeeAction} className="grid gap-4">
            <Field label="Name"><input name="fullName" required className={inputClass} /></Field>
            <Field label="E-Mail"><input name="email" type="email" required className={inputClass} /></Field>
            <Field label="Telefon"><input name="phone" className={inputClass} /></Field>
            <Field label="Notizen"><textarea name="notes" rows={3} className={inputClass} /></Field>
            <button className={buttonClass}>Einladung senden</button>
          </form>
        </Panel>
        <Panel title="Mitarbeiterliste">
          {employees?.length ? (
            <div className="grid gap-3">
              {employees.map((employee) => (
                <article key={employee.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{asText(employee.full_name)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(employee.email)} · {asText(employee.phone)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(employee.notes)}</p>
                    </div>
                    <StatusPill>{employee.status}</StatusPill>
                  </div>
                  {employee.user_id ? (
                    <form action={deactivateUserAction} className="mt-3">
                      <input type="hidden" name="profileId" value={employee.user_id} />
                      <button className="text-sm font-bold text-red-700 underline">Deaktivieren</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine Mitarbeiter" text="Neue Mitarbeiter können per Invite-Mail aktiviert werden." />
          )}
        </Panel>
      </div>
    </>
  );
}
