import Link from "next/link";
import { PageHeader, Panel, EmptyState, StatusPill, buttonClass } from "@/components/portal/PortalUI";
import { asText, firstRelation } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeProjectsPage() {
  const profile = await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employee_profiles").select("id").eq("user_id", profile.id).single();
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select("projects(id,customer_id,status,name,object_address,project_employee_briefings(employee_instructions),project_tasks(id,title,interval_label,seasonal,project_task_employee_notes(employee_notes)))")
    .eq("employee_id", employee?.id ?? "");

  return (
    <>
      <PageHeader eyebrow="Projekte" title="Zugewiesene Objekte" text="Tätigkeiten, Intervalle und Mitarbeiteranweisungen ohne Preise oder Kundendokumente." />
      <Panel title="Projektliste">
        {assignments?.length ? (
          <div className="grid gap-4">
            {assignments.map((assignment) => {
              const project = firstRelation(assignment.projects);
              return (
                <article key={project?.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{asText(project?.name)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(project?.object_address)}</p>
                      <p className="mt-3 rounded-md bg-white p-3 text-sm font-semibold leading-6 text-slate-700">
                        {asText(firstRelation(project?.project_employee_briefings)?.employee_instructions || "Keine besonderen Mitarbeiteranweisungen hinterlegt.")}
                      </p>
                    </div>
                    <StatusPill>{asText(project?.status)}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {(project?.project_tasks ?? []).map((task: { id: string; title: string; interval_label: string; seasonal: boolean; project_task_employee_notes: { employee_notes: string | null } | { employee_notes: string | null }[] | null }) => (
                      <div key={task.id} className="rounded-md bg-white p-3 text-sm">
                        <p className="font-extrabold text-slate-950">{task.title}</p>
                        <p className="mt-1 text-slate-650">{task.interval_label}{task.seasonal ? " · saisonal" : ""}</p>
                        {firstRelation(task.project_task_employee_notes)?.employee_notes ? <p className="mt-1 text-slate-650">{firstRelation(task.project_task_employee_notes)?.employee_notes}</p> : null}
                      </div>
                    ))}
                  </div>
                  <Link href="/app/today" className={`${buttonClass} mt-4`}>Geplante Einsätze öffnen</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Keine Projekte" text="Sobald Sie zugewiesen sind, erscheinen die Objekte hier." />
        )}
      </Panel>
    </>
  );
}
