import { Activity, Clock3, ListChecks } from "lucide-react";
import {
  CompactSection,
  EmptyState,
  PageHeader,
  Panel,
  StatusPill,
} from "@/components/portal/PortalUI";
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
      <PageHeader
        eyebrow="Betreuung"
        title="Ihre Objektbetreuung"
        text="Leistungen und geprüfte Einsätze – kompakt je Objekt."
        icon={<Activity aria-hidden="true" size={20} />}
        compact
      />
      <div className="grid gap-4">
        <Panel
          title="Objekte und Leistungen"
          description="Das Wichtigste steht direkt oben; einzelne Leistungspläne lassen sich bei Bedarf öffnen."
        >
          {projects?.length ? (
            <div className="grid gap-4">
              {projects.map((project) => (
                <article key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{project.name}</p>
                      <p className="mt-1 text-sm text-slate-650">{project.object_address} · {asText(project.object_type)}</p>
                    </div>
                    <StatusPill>{project.status}</StatusPill>
                  </div>
                  <details className="group mt-4 rounded-xl border border-slate-200 bg-white">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-black text-slate-800 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2">
                        <ListChecks aria-hidden="true" size={17} className="text-brand" />
                        {project.project_tasks?.length ?? 0} Leistungen anzeigen
                      </span>
                      <span aria-hidden="true" className="text-brand transition group-open:rotate-45">+</span>
                    </summary>
                    <div className="grid gap-2 border-t border-slate-100 p-3">
                      {(project.project_tasks ?? []).map((task: { title: string; interval_label: string; seasonal: boolean }) => (
                        <div key={task.title} className="rounded-lg bg-slate-50 p-3 text-sm">
                          <p className="font-extrabold text-slate-950">{task.title}</p>
                          <p className="mt-1 text-slate-650">{task.interval_label}{task.seasonal ? " · saisonal" : ""}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine Betreuung" text="Nach Angebotsannahme oder Admin-Freigabe wird die Betreuung hier sichtbar." />
          )}
        </Panel>
        <CompactSection
          title="Freigegebene Einsätze"
          description="Geprüfte Arbeitszeiten und Einsatznachweise"
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-black text-brand">
              <Clock3 aria-hidden="true" size={14} /> {shifts?.length ?? 0}
            </span>
          }
        >
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
        </CompactSection>
      </div>
    </>
  );
}
