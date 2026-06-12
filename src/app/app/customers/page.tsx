import { PageHeader, Panel, EmptyState } from "@/components/portal/PortalUI";
import { asText, firstRelation } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeCustomersPage() {
  const profile = await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employee_profiles").select("id").eq("user_id", profile.id).single();
  const { data: assignments } = await supabase
    .from("project_assignments")
    .select("projects(name,object_address,customers(company_name,contact_name,email,phone))")
    .eq("employee_id", employee?.id ?? "");

  return (
    <>
      <PageHeader eyebrow="Kunden" title="Zugewiesene Kunden" text="Nur Kunden und Objekte, denen Sie zugewiesen sind. Preise, Angebote und Rechnungen bleiben ausgeblendet." />
      <Panel title="Kundenübersicht">
        {assignments?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {assignments.map((assignment, index) => (
              <article key={`${firstRelation(assignment.projects)?.name}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-extrabold text-slate-950">
                  {asText(firstRelation(firstRelation(assignment.projects)?.customers)?.company_name || firstRelation(firstRelation(assignment.projects)?.customers)?.contact_name)}
                </p>
                <p className="mt-1 text-sm text-slate-650">
                  {asText(firstRelation(firstRelation(assignment.projects)?.customers)?.email)} · {asText(firstRelation(firstRelation(assignment.projects)?.customers)?.phone)}
                </p>
                <p className="mt-3 text-sm font-bold text-slate-800">{asText(firstRelation(assignment.projects)?.name)}</p>
                <p className="mt-1 text-sm text-slate-650">{asText(firstRelation(assignment.projects)?.object_address)}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Kunden" text="Zuweisungen nimmt der Admin vor." />
        )}
      </Panel>
    </>
  );
}
