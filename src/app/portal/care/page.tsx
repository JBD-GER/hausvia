import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireCustomerContext } from "@/lib/portal/access";

export default async function CustomerCarePage() {
  const { customerId, supabase } = await requireCustomerContext();
  const [{ data: projects, error: projectsError }, { data: shifts, error: shiftsError }] = await Promise.all([
    supabase.from("projects").select("id,status,name,object_address,object_type,public_notes,project_tasks(title,interval_label,seasonal)").eq("customer_id", customerId),
    supabase.from("shifts").select("id,started_at,ended_at,net_minutes,projects(name)").eq("customer_id", customerId).eq("customer_visible", true).eq("status", "approved").order("started_at", { ascending: false }),
  ]);
  if (projectsError || shiftsError) throw new Error("Die Objektbetreuung konnte nicht vollständig geladen werden.");

  return (
    <>
      <PageHeader eyebrow="Betreuung" title="Ihre Objektbetreuung" text="Beauftragte Leistungen, Intervalle und freigegebene Einsätze in kundenfreundlicher Übersicht." />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Panel title="Objekte und Leistungen">
          {projects?.length ? (
            <div className="grid gap-4">
              {projects.map((project) => (
                <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{project.name}</p>
                      <p className="mt-1 text-sm text-slate-650">{project.object_address} · {asText(project.object_type)}</p>
                    </div>
                    <StatusPill>{project.status}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {(project.project_tasks ?? []).map((task: { title: string; interval_label: string; seasonal: boolean }) => (
                      <div key={task.title} className="rounded-md bg-white p-3 text-sm">
                        <p className="font-extrabold text-slate-950">{task.title}</p>
                        <p className="mt-1 text-slate-650">{task.interval_label}{task.seasonal ? " · saisonal" : ""}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine Betreuung" text="Nach Angebotsannahme oder Admin-Freigabe wird die Betreuung hier sichtbar." />
          )}
        </Panel>
        <Panel title="Freigegebene Einsätze">
          {shifts?.length ? (
            <div className="grid gap-3">
              {shifts.map((shift) => (
                <article key={shift.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-extrabold text-slate-950">{asText(firstRelation(shift.projects)?.name)}</p>
                  <p className="mt-1 text-sm text-slate-650">{formatDateTime(shift.started_at)} · {shift.net_minutes} Minuten</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine freigegebenen Einsätze" text="Geprüfte Einsätze erscheinen nach Admin-Freigabe." />
          )}
        </Panel>
      </div>
    </>
  );
}
