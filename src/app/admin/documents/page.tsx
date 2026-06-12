import { uploadDocumentAction } from "@/app/actions/admin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, formatDateTime } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminDocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: documents }, { data: customers }, { data: projects }] = await Promise.all([
    supabase.from("documents").select("id,bucket,filename,visibility,released_to_customer,created_at").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("projects").select("id,name").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Dokumente" title="Dateien und Storage" text="Angebots-PDFs, Rechnungen, Kunden- und Projektdokumente sicher ablegen." />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Datei hochladen">
          <form action={uploadDocumentAction} className="grid gap-4">
            <Field label="Bucket">
              <select name="bucket" className={inputClass} defaultValue="customer-documents">
                <option value="offer-pdfs">Angebots-PDFs</option>
                <option value="invoice-pdfs">Rechnungs-PDFs</option>
                <option value="customer-documents">Kundendokumente</option>
                <option value="project-documents">Projektdokumente</option>
                <option value="shift-photos">Schichtfotos</option>
              </select>
            </Field>
            <Field label="Kunde optional">
              <select name="customerId" className={inputClass}>
                <option value="">ohne Kunde</option>
                {customers?.map((customer) => (
                  <option key={customer.id} value={customer.id}>{asText(customer.company_name || customer.contact_name || customer.email)}</option>
                ))}
              </select>
            </Field>
            <Field label="Projekt optional">
              <select name="projectId" className={inputClass}>
                <option value="">ohne Projekt</option>
                {projects?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </Field>
            <Field label="Sichtbarkeit">
              <select name="visibility" className={inputClass} defaultValue="admin">
                <option value="admin">nur Admin</option>
                <option value="employee">Mitarbeiter</option>
                <option value="customer">Kunde</option>
                <option value="shared">geteilt</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="releasedToCustomer" /> für Kunden freigeben
            </label>
            <Field label="Datei"><input name="file" type="file" required className={inputClass} /></Field>
            <button className={buttonClass}>Datei hochladen</button>
          </form>
        </Panel>
        <Panel title="Dokumente">
          {documents?.length ? (
            <div className="grid gap-3">
              {documents.map((document) => (
                <article key={document.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{document.filename}</p>
                      <p className="mt-1 text-sm text-slate-650">{document.bucket} · {formatDateTime(document.created_at)}</p>
                    </div>
                    <StatusPill>{document.released_to_customer ? "Kunde sichtbar" : document.visibility}</StatusPill>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Dokumente" text="Hochgeladene Dateien erscheinen hier." />
          )}
        </Panel>
      </div>
    </>
  );
}
