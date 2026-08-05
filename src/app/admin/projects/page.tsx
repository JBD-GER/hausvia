import { assignEmployeeAction, createProjectAction, createTaskAction, updateProjectStatusAction } from "@/app/actions/admin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

export default async function AdminProjectsPage() {
  const { admin: supabase } = await requireAdminContext();
  const [{ data: projects }, { data: customers }, { data: employees }] = await Promise.all([
    supabase.from("projects").select("id,status,name,object_address,object_type,customer_id,primary_employee_id,employee_instructions").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,company_name,contact_name,email").order("created_at", { ascending: false }),
    supabase.from("employee_profiles").select("id,full_name,email,status").neq("status", "disabled").order("full_name"),
  ]);

  return (
    <>
      <PageHeader eyebrow="Projekte" title="Objekte, Tätigkeiten und Zuweisungen" text="Objektbetreuung planen, Mitarbeiter zuweisen und regelmäßige Tätigkeiten anlegen." />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Projekt erstellen">
          <form action={createProjectAction} className="grid gap-4">
            <Field label="Kunde">
              <select name="customerId" required className={inputClass}>
                <option value="">Kunde auswählen</option>
                {customers?.map((customer) => (
                  <option key={customer.id} value={customer.id}>{asText(customer.company_name || customer.contact_name || customer.email)}</option>
                ))}
              </select>
            </Field>
            <Field label="Projektname"><input name="name" required className={inputClass} /></Field>
            <Field label="Objektadresse"><input name="objectAddress" required className={inputClass} /></Field>
            <Field label="Objektart"><input name="objectType" className={inputClass} /></Field>
            <Field label="Mitarbeiteranweisungen"><textarea name="employeeInstructions" rows={3} className={inputClass} /></Field>
            <button className={buttonClass}>Projekt anlegen</button>
          </form>
        </Panel>
        <Panel title="Projektliste">
          {projects?.length ? (
            <div className="grid gap-4">
              {projects.map((project) => (
                <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{project.name}</p>
                      <p className="mt-1 text-sm text-slate-650">{project.object_address} · {asText(project.object_type)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(project.employee_instructions)}</p>
                    </div>
                    <StatusPill>{project.status}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <form action={assignEmployeeAction} className="grid gap-2">
                      <input type="hidden" name="projectId" value={project.id} />
                      <select name="employeeId" required className={inputClass}>
                        <option value="">Mitarbeiter</option>
                        {employees?.map((employee) => (
                          <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                        ))}
                      </select>
                      <button className={buttonClass}>Zuweisen</button>
                    </form>
                    <form action={updateProjectStatusAction} className="grid gap-2">
                      <input type="hidden" name="projectId" value={project.id} />
                      <select name="status" className={inputClass} defaultValue={project.status}>
                        <option value="planning">Planung</option>
                        <option value="active">Aktiv</option>
                        <option value="paused">Pausiert</option>
                        <option value="completed">Abgeschlossen</option>
                      </select>
                      <button className={buttonClass}>Status</button>
                    </form>
                    <form action={createTaskAction} className="grid gap-2">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input name="title" placeholder="Tätigkeit" required className={inputClass} />
                      <input name="intervalLabel" placeholder="z. B. wöchentlich" className={inputClass} />
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <input type="checkbox" name="seasonal" /> saisonal
                      </label>
                      <button className={buttonClass}>Tätigkeit</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Projekte" text="Aus Funnel-Anfragen oder manuell angelegte Projekte erscheinen hier." />
          )}
        </Panel>
      </div>
    </>
  );
}
