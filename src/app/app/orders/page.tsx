import { createMaterialRequestAction } from "@/app/actions/employee";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeOrdersPage() {
  const profile = await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employee_profiles").select("id").eq("user_id", profile.id).single();
  const [{ data: assignments }, { data: requests }] = await Promise.all([
    supabase.from("project_assignments").select("projects(id,customer_id,name,object_address)").eq("employee_id", employee?.id ?? ""),
    supabase.from("material_requests").select("id,status,title,category,quantity,unit,note,admin_comment,created_at,projects(name)").eq("user_id", profile.id).order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Material" title="Material anfordern" text="Reinigungsmittel, Streusalz, Müllsäcke, Werkzeug oder sonstiges Material pro Objekt anfragen." />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Neue Anforderung">
          <form action={createMaterialRequestAction} className="grid gap-4">
            <Field label="Projekt">
              <select name="projectId" required className={inputClass}>
                <option value="">Projekt auswählen</option>
                {assignments?.map((assignment) => (
                  <option key={firstRelation(assignment.projects)?.id} value={firstRelation(assignment.projects)?.id}>{asText(firstRelation(assignment.projects)?.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Kunde">
              <select name="customerId" required className={inputClass}>
                <option value="">Kunde auswählen</option>
                {assignments?.map((assignment) => (
                  <option key={firstRelation(assignment.projects)?.customer_id} value={firstRelation(assignment.projects)?.customer_id}>{asText(firstRelation(assignment.projects)?.name)}</option>
                ))}
              </select>
            </Field>
            <Field label="Material"><input name="title" required className={inputClass} placeholder="z. B. Streusalz" /></Field>
            <Field label="Kategorie"><input name="category" className={inputClass} placeholder="Reinigungsmittel, Streusalz, Werkzeug..." /></Field>
            <Field label="Menge"><input name="quantity" inputMode="decimal" className={inputClass} defaultValue="1" /></Field>
            <Field label="Einheit"><input name="unit" className={inputClass} placeholder="Sack, Liter, Stück" /></Field>
            <Field label="Notiz"><textarea name="note" rows={3} className={inputClass} /></Field>
            <button className={buttonClass}>Material anfordern</button>
          </form>
        </Panel>
        <Panel title="Meine Anforderungen">
          {requests?.length ? (
            <div className="grid gap-3">
              {requests.map((request) => (
                <article key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{request.title}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(request.category)} · {asText(request.quantity)} {asText(request.unit)}</p>
                      <p className="mt-1 text-sm text-slate-650">{formatDateTime(request.created_at)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(firstRelation(request.projects)?.name)}</p>
                      {request.admin_comment ? <p className="mt-2 text-sm text-slate-700">{request.admin_comment}</p> : null}
                    </div>
                    <StatusPill>{request.status}</StatusPill>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Anforderungen" text="Neue Materialanforderungen werden hier verfolgt." />
          )}
        </Panel>
      </div>
    </>
  );
}
