import { uploadDocumentAction } from "@/app/actions/admin";
import { PortalDialog } from "@/components/portal/PortalDialog";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, formatDateTime } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

export default async function AdminDocumentsPage() {
  const { admin: supabase } = await requireAdminContext();
  const [{ data: documents }, { data: customers }, { data: projects }] = await Promise.all([
    supabase.from("documents").select("id,bucket,filename,visibility,released_to_customer,created_at").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("projects").select("id,name").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Dokumente"
        title="Dateien und Storage"
        text="Angebots-PDFs, Rechnungen, Kunden- und Projektdokumente sicher ablegen."
        actions={(
          <PortalDialog
            triggerLabel="Datei hochladen"
            title="Neue Datei hochladen"
            description="Ordnen Sie die Datei einem Bereich und optional einem Kunden oder Projekt zu."
          >
            <form action={uploadDocumentAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Bucket">
                <select name="bucket" className={inputClass} defaultValue="customer-documents">
                  <option value="offer-pdfs">Angebots-PDFs</option>
                  <option value="invoice-pdfs">Rechnungs-PDFs</option>
                  <option value="customer-documents">Kundendokumente</option>
                  <option value="project-documents">Projektdokumente</option>
                  <option value="shift-photos">Schichtfotos</option>
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
              <Field label="Datei" className="sm:col-span-2"><input name="file" type="file" required className={inputClass} /></Field>
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 sm:col-span-2">
                <input type="checkbox" name="releasedToCustomer" className="size-5 rounded border-slate-300 text-brand focus:ring-brand" />
                Für Kunden freigeben
              </label>
              <button className={`${buttonClass} sm:col-span-2`}>Datei hochladen</button>
            </form>
          </PortalDialog>
        )}
      />
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
    </>
  );
}
