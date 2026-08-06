import { ContactRound } from "lucide-react";
import { CompactSection, PageHeader, EmptyState } from "@/components/portal/PortalUI";
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
      <PageHeader
        eyebrow="Kunden"
        title="Zugewiesene Kontakte"
        text="Kontaktdaten passend zu Ihren aktuellen Objekten."
        icon={<ContactRound aria-hidden="true" size={20} />}
        compact
      />
      <div className="grid gap-3 md:grid-cols-2">
        {assignments?.length ? (
          assignments.map((assignment, index) => {
            const project = firstRelation(assignment.projects);
            const customer = firstRelation(project?.customers);
            const customerName = asText(customer?.company_name || customer?.contact_name);
            return (
              <CompactSection
                key={`${project?.name}-${index}`}
                title={customerName}
                description={asText(project?.name)}
              >
                <article>
                  <p className="font-extrabold text-slate-950">
                    {customerName}
                  </p>
                  <p className="mt-1 text-sm text-slate-650">
                    {asText(customer?.email)} · {asText(customer?.phone)}
                  </p>
                  <p className="mt-3 text-sm font-bold text-slate-800">{asText(project?.name)}</p>
                  <p className="mt-1 text-sm text-slate-650">{asText(project?.object_address)}</p>
                </article>
              </CompactSection>
            );
          })
        ) : (
          <EmptyState title="Keine Kunden" text="Zuweisungen nimmt der Admin vor." />
        )}
      </div>
    </>
  );
}
