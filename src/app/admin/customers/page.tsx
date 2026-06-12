import { inviteCustomerAction } from "@/app/actions/admin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminCustomersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id,status,company_name,contact_name,email,phone,billing_address,portal_user_id")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader eyebrow="Kunden" title="Kunden verwalten" text="Kunden anlegen, einladen und Portalzugänge verbinden." />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Kunden einladen">
          <form action={inviteCustomerAction} className="grid gap-4">
            <Field label="Firma"><input name="companyName" className={inputClass} /></Field>
            <Field label="Ansprechpartner"><input name="contactName" required className={inputClass} /></Field>
            <Field label="E-Mail"><input name="email" type="email" required className={inputClass} /></Field>
            <Field label="Telefon"><input name="phone" className={inputClass} /></Field>
            <Field label="Adresse"><input name="billingAddress" className={inputClass} /></Field>
            <button className={buttonClass}>Kundenportal-Einladung senden</button>
          </form>
        </Panel>
        <Panel title="Kundenliste">
          {customers?.length ? (
            <div className="grid gap-3">
              {customers.map((customer) => (
                <article key={customer.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{asText(customer.company_name || customer.contact_name)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(customer.email)} · {asText(customer.phone)}</p>
                      <p className="mt-1 text-sm text-slate-650">{asText(customer.billing_address)}</p>
                    </div>
                    <StatusPill>{customer.portal_user_id ? "Portal aktiv" : customer.status}</StatusPill>
                  </div>
                  {!customer.portal_user_id ? (
                    <form action={inviteCustomerAction} className="mt-3">
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input type="hidden" name="companyName" value={customer.company_name ?? ""} />
                      <input type="hidden" name="contactName" value={customer.contact_name ?? ""} />
                      <input type="hidden" name="email" value={customer.email} />
                      <input type="hidden" name="phone" value={customer.phone ?? ""} />
                      <input type="hidden" name="billingAddress" value={customer.billing_address ?? ""} />
                      <button className="text-sm font-extrabold text-brand underline">Portal-Einladung senden</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine Kunden" text="Leads aus dem Funnel oder manuelle Einladungen erscheinen hier." />
          )}
        </Panel>
      </div>
    </>
  );
}
