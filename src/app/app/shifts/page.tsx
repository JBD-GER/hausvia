import { submitShiftAction } from "@/app/actions/employee";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeShiftsPage() {
  const profile = await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const [{ data: shifts }, { data: tasks }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id,status,started_at,ended_at,gross_minutes,break_minutes,net_minutes,notes,project_id,projects(name,object_address)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase.from("project_tasks").select("id,project_id,title,interval_label").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader eyebrow="Schichten" title="Zeiterfassung" text="Schicht starten, Ende eintragen, Tätigkeiten abhaken und zur Prüfung einreichen." />
      <Panel title="Eigene Schichten">
        {shifts?.length ? (
          <div className="grid gap-4">
            {shifts.map((shift) => {
              const projectTasks = (tasks ?? []).filter((task) => task.project_id === shift.project_id);
              return (
                <article key={shift.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{asText(firstRelation(shift.projects)?.name)}</p>
                      <p className="mt-1 text-sm text-slate-650">{formatDateTime(shift.started_at)}</p>
                      <p className="mt-1 text-sm text-slate-650">
                        Brutto {shift.gross_minutes} Min · Pause {shift.break_minutes} Min · Netto {shift.net_minutes} Min
                      </p>
                    </div>
                    <StatusPill>{shift.status}</StatusPill>
                  </div>
                  {shift.status === "open" ? (
                    <form action={submitShiftAction} className="mt-4 grid gap-4">
                      <input type="hidden" name="shiftId" value={shift.id} />
                      <Field label="Startzeit">
                        <input name="startedAt" type="datetime-local" required className={inputClass} defaultValue={String(shift.started_at).slice(0, 16)} />
                      </Field>
                      <Field label="Endzeit">
                        <input name="endedAt" type="datetime-local" required className={inputClass} />
                      </Field>
                      <div className="rounded-lg bg-white p-4">
                        <p className="text-sm font-extrabold text-slate-950">Erledigte Tätigkeiten</p>
                        <div className="mt-3 grid gap-2">
                          {projectTasks.map((task) => (
                            <label key={task.id} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                              <input type="checkbox" name="taskId" value={task.id} className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand" />
                              {task.title} <span className="text-slate-500">({task.interval_label})</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <Field label="Notiz">
                        <textarea name="notes" rows={3} className={inputClass} placeholder="Auffälligkeiten, erledigte Arbeiten, Hinweise" />
                      </Field>
                      <button className={buttonClass}>Schicht einreichen</button>
                    </form>
                  ) : (
                    <p className="mt-4 rounded-md bg-white p-3 text-sm font-semibold text-slate-700">{asText(shift.notes)}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Keine Schichten" text="Starten Sie eine Schicht direkt in der Projektansicht." />
        )}
      </Panel>
    </>
  );
}
