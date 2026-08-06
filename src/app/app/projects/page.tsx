import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { CompactSection, PageHeader, EmptyState, StatusPill, buttonClass } from "@/components/portal/PortalUI";
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
      <PageHeader
        eyebrow="Projekte"
        title="Zugewiesene Projekte"
        text="Briefing und Aufgaben öffnen Sie nur für das Projekt, an dem Sie gerade arbeiten."
        icon={<BriefcaseBusiness aria-hidden="true" size={20} />}
        compact
      />
      <div className="grid gap-3">
        {assignments?.length ? (
          assignments.map((assignment) => {
            const project = firstRelation(assignment.projects);
            return (
              <CompactSection
                key={project?.id}
                title={asText(project?.name)}
                description={asText(project?.object_address)}
                badge={<StatusPill>{asText(project?.status)}</StatusPill>}
              >
                <article>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="rounded-xl bg-brand-soft p-3 text-sm font-semibold leading-6 text-slate-700">
                        {asText(firstRelation(project?.project_employee_briefings)?.employee_instructions || "Keine besonderen Mitarbeiteranweisungen hinterlegt.")}
                      </p>
                    </div>
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
              </CompactSection>
            );
          })
        ) : (
          <EmptyState title="Keine Projekte" text="Sobald Sie zugewiesen sind, erscheinen die Objekte hier." />
        )}
      </div>
    </>
  );
}
