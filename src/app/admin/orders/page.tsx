import { updateMaterialRequestStatusAction } from "@/app/actions/admin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

export default async function AdminOrdersPage() {
  const { admin: supabase } = await requireAdminContext();
  const { data: requests } = await supabase
    .from("material_requests")
    .select("id,status,title,category,quantity,unit,note,admin_comment,created_at,projects(name),employee_profiles(full_name)")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader eyebrow="Material" title="Materialanforderungen" text="Anfragen von Mitarbeitern prüfen, genehmigen, bestellen oder ablehnen." />
      <Panel title="Offene und erledigte Anforderungen">
        {requests?.length ? (
          <div className="grid gap-4">
            {requests.map((request) => (
              <article key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-extrabold text-slate-950">{request.title}</p>
                    <p className="mt-1 text-sm text-slate-650">{asText(request.category)} · {asText(request.quantity)} {asText(request.unit)}</p>
                    <p className="mt-1 text-sm text-slate-650">
                      {asText(firstRelation(request.projects)?.name)} · {asText(firstRelation(request.employee_profiles)?.full_name)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{asText(request.note)}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{formatDateTime(request.created_at)}</p>
                  </div>
                  <StatusPill>{request.status}</StatusPill>
                </div>
                <form action={updateMaterialRequestStatusAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="requestId" value={request.id} />
                  <Field label="Status">
                    <select name="status" className={inputClass} defaultValue={request.status}>
                      <option value="requested">angefragt</option>
                      <option value="approved">genehmigt</option>
                      <option value="ordered">bestellt</option>
                      <option value="delivered">geliefert</option>
                      <option value="rejected">abgelehnt</option>
                      <option value="canceled">storniert</option>
                    </select>
                  </Field>
                  <Field label="Admin-Kommentar"><input name="adminComment" className={inputClass} defaultValue={request.admin_comment ?? ""} /></Field>
                  <button className={`${buttonClass} self-end`}>Speichern</button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Materialanforderungen" text="Mitarbeiter können Material pro Projekt anfordern." />
        )}
      </Panel>
    </>
  );
}
