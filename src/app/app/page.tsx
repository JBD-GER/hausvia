import Link from "next/link";
import { PageHeader, MetricCard, Panel, StatusPill, EmptyState } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeDashboardPage() {
  const profile = await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employee_profiles").select("id").eq("user_id", profile.id).single();
  const [{ data: assignments }, { data: shifts }, { data: materials }] = await Promise.all([
    supabase.from("project_assignments").select("projects(id,name,object_address,status)").eq("employee_id", employee?.id ?? ""),
    supabase.from("shifts").select("id,status,started_at,ended_at,projects(name)").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("material_requests").select("id,status,title,created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(5),
  ]);

  return (
    <>
      <PageHeader eyebrow="Mitarbeiterportal" title="Heute bei Hausvia" text="Ihre Projekte, offenen Schichten und Materialanforderungen." />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Zugewiesene Projekte" value={assignments?.length ?? 0} tone="accent" />
        <MetricCard label="Eigene Schichten" value={shifts?.length ?? 0} />
        <MetricCard label="Materialanfragen" value={materials?.length ?? 0} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Nächste Objekte">
          {assignments?.length ? (
            <div className="grid gap-3">
              {assignments.map((assignment) => (
                <Link key={firstRelation(assignment.projects)?.id} href="/app/projects" className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-brand">
                  <p className="font-extrabold text-slate-950">{asText(firstRelation(assignment.projects)?.name)}</p>
                  <p className="mt-1 text-sm text-slate-650">{asText(firstRelation(assignment.projects)?.object_address)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Zuweisungen" text="Sobald ein Admin Sie einem Projekt zuweist, erscheint es hier." />
          )}
        </Panel>
        <Panel title="Letzte Schichten">
          <div className="grid gap-3">
            {shifts?.map((shift) => (
              <article key={shift.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-extrabold text-slate-950">{asText(firstRelation(shift.projects)?.name)}</p>
                <p className="mt-1 text-sm text-slate-650">{formatDateTime(shift.started_at)}</p>
                <StatusPill>{shift.status}</StatusPill>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
