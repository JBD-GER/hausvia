import Link from "next/link";
import { revokeInvitationAction, sendInvitationAction } from "@/app/actions/auth";
import { createCustomerAction, updateCustomerStatusAction } from "@/app/actions/portalAdmin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { CUSTOMER_CATEGORY_LABELS, formatGermanDate } from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";
import { paginateItems } from "@/lib/portal/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const customerStatusLabels: Record<string, string> = {
  active: "Aktiv",
  inactive: "Deaktiviert",
  archived: "Archiviert",
  lead: "Interessent",
};

const invitationStatusLabels: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  pending: "Versendet",
  accepted: "Angenommen",
  expired: "Abgelaufen",
  revoked: "Widerrufen",
};

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function customerName(customer: Record<string, unknown>) {
  const person = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return String(customer.company_name || person || customer.contact_name || customer.email || "Unbenannter Kunde");
}

function contactName(customer: Record<string, unknown>) {
  const contact = [customer.contact_first_name, customer.contact_last_name].filter(Boolean).join(" ");
  return contact || String(customer.contact_name || "–");
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const categoryFilter = queryValue(params, "category");
  const statusFilter = queryValue(params, "customerStatus");
  const sort = queryValue(params, "sort") || "newest";
  const { admin: supabase } = await requireAdminContext();
  const [
    { data: customers, error: customersError },
    { data: properties, error: propertiesError },
    { data: invitations, error: invitationsError },
  ] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("properties").select("id,customer_id,status"),
    supabase.from("invitations").select("*").eq("role", "customer").order("created_at", { ascending: false }),
  ]);
  if (customersError || propertiesError || invitationsError) {
    throw new Error("Die Kundenliste konnte nicht vollständig geladen werden.");
  }

  const propertyCount = new Map<string, number>();
  for (const property of properties ?? []) {
    propertyCount.set(property.customer_id, (propertyCount.get(property.customer_id) ?? 0) + 1);
  }

  const invitationByCustomer = new Map<string, Record<string, unknown>>();
  for (const invitation of invitations ?? []) {
    if (invitation.customer_id && !invitationByCustomer.has(invitation.customer_id)) {
      invitationByCustomer.set(invitation.customer_id, invitation);
    }
  }

  const filteredCustomers = (customers ?? []).filter((customer) => {
    const haystack = [
      customerName(customer),
      contactName(customer),
      customer.email,
      customer.phone,
      customer.billing_city,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de");
    return (
      (!search || haystack.includes(search)) &&
      (!categoryFilter || customer.category === categoryFilter) &&
      (!statusFilter || customer.status === statusFilter)
    );
  }).sort((left, right) => {
    if (sort === "name") return customerName(left).localeCompare(customerName(right), "de");
    if (sort === "oldest") return String(left.created_at).localeCompare(String(right.created_at));
    return String(right.created_at).localeCompare(String(left.created_at));
  });
  const customerPage = paginateItems(filteredCustomers, queryValue(params, "page"));

  return (
    <>
      <PageHeader
        eyebrow="Kunden"
        title="Kunden verwalten"
        text="Stammdaten strukturiert anlegen, Einladungen steuern und zugehörige Immobilien im Blick behalten."
      />

      {queryValue(params, "status") ? (
        <p className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900" role="status">
          {queryValue(params, "status")}
        </p>
      ) : null}
      {queryValue(params, "error") ? (
        <p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900" role="alert">
          {queryValue(params, "error")}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Kunde anlegen">
          <form action={createCustomerAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Kundenkategorie">
              <select name="category" required className={inputClass} defaultValue="private">
                {Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Firma (je nach Kategorie)"><input name="companyName" autoComplete="organization" className={inputClass} /></Field>
            <Field label="Vorname"><input name="firstName" autoComplete="given-name" className={inputClass} /></Field>
            <Field label="Nachname"><input name="lastName" autoComplete="family-name" className={inputClass} /></Field>
            <Field label="Ansprechpartner Vorname"><input name="contactFirstName" className={inputClass} /></Field>
            <Field label="Ansprechpartner Nachname"><input name="contactLastName" className={inputClass} /></Field>
            <Field label="E-Mail"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
            <Field label="Telefon"><input name="phone" type="tel" required autoComplete="tel" className={inputClass} /></Field>
            <Field label="Straße"><input name="street" required autoComplete="address-line1" className={inputClass} /></Field>
            <Field label="Hausnummer"><input name="houseNumber" required className={inputClass} /></Field>
            <Field label="Postleitzahl"><input name="postalCode" required inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" className={inputClass} /></Field>
            <Field label="Ort"><input name="city" required autoComplete="address-level2" className={inputClass} /></Field>
            <Field label="Land"><input name="country" required autoComplete="country-name" defaultValue="Deutschland" className={inputClass} /></Field>
            <label className="block sm:col-span-2">
              <span className="text-sm font-bold text-slate-800">Interne Notiz</span>
              <textarea name="notes" rows={3} className={inputClass} />
            </label>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
              Nach dem Speichern entsteht zunächst eine Einladung als Entwurf. Der Versand erfolgt kontrolliert aus der Kundenliste.
            </p>
            <button className={`${buttonClass} sm:col-span-2`}>Kunde speichern</button>
          </form>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Suchen und filtern">
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Suche"><input name="q" defaultValue={queryValue(params, "q")} placeholder="Name, Firma, Ort …" className={inputClass} /></Field>
              <Field label="Kategorie">
                <select name="category" defaultValue={categoryFilter} className={inputClass}>
                  <option value="">Alle Kategorien</option>
                  {Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Kontostatus">
                <select name="customerStatus" defaultValue={statusFilter} className={inputClass}>
                  <option value="">Alle Status</option>
                  <option value="lead">Interessent</option>
                  <option value="active">Aktiv</option>
                  <option value="inactive">Deaktiviert</option>
                  <option value="archived">Archiviert</option>
                </select>
              </Field>
              <Field label="Sortierung">
                <select name="sort" defaultValue={sort} className={inputClass}>
                  <option value="newest">Neueste zuerst</option>
                  <option value="oldest">Älteste zuerst</option>
                  <option value="name">Name A–Z</option>
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <button className={buttonClass}>Anwenden</button>
                <Link href="/admin/customers" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand underline">Zurücksetzen</Link>
              </div>
            </form>
          </Panel>

          <Panel title={`Kundenliste (${filteredCustomers.length})`}>
            {filteredCustomers.length ? (
              <>
                <div className="grid gap-4">
                  {customerPage.items.map((customer) => {
                    const invitation = invitationByCustomer.get(customer.id);
                    const inviteStatus = String(invitation?.status ?? "draft");
                    const category = customer.category as keyof typeof CUSTOMER_CATEGORY_LABELS;
                    return (
                      <article key={customer.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h2 className="text-lg font-extrabold text-slate-950">{customerName(customer)}</h2>
                            <p className="mt-1 text-sm text-slate-650">{CUSTOMER_CATEGORY_LABELS[category] ?? customer.category} · Ansprechpartner: {contactName(customer)}</p>
                            <p className="mt-1 break-words text-sm text-slate-650">{customer.email} · {customer.phone || "keine Telefonnummer"}</p>
                            <p className="mt-1 text-sm text-slate-650">{customer.billing_address || "Keine Rechnungsadresse"}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusPill>{customerStatusLabels[customer.status] ?? customer.status}</StatusPill>
                            <StatusPill>Einladung: {invitationStatusLabels[inviteStatus] ?? inviteStatus}</StatusPill>
                          </div>
                        </div>

                        <dl className="mt-4 grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-2">
                          <div><dt className="font-bold text-slate-500">Immobilien</dt><dd className="mt-1 font-extrabold text-slate-950">{propertyCount.get(customer.id) ?? 0}</dd></div>
                          <div><dt className="font-bold text-slate-500">Erstellt</dt><dd className="mt-1 font-semibold text-slate-800">{formatGermanDate(customer.created_at)}</dd></div>
                        </dl>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link
                            href={`/admin/customers/${customer.id}`}
                            className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand/20 bg-white px-4 py-2 text-sm font-extrabold text-brand hover:bg-brand-soft"
                          >
                            Details bearbeiten
                          </Link>
                          {invitation?.id && inviteStatus !== "accepted" ? (
                            <form action={sendInvitationAction}>
                              <input type="hidden" name="invitationId" value={String(invitation.id)} />
                              <button className={buttonClass}>{inviteStatus === "sent" || inviteStatus === "pending" ? "Einladung erneut senden" : "Einladung senden"}</button>
                            </form>
                          ) : null}
                          {invitation?.id && ["sent", "pending"].includes(inviteStatus) ? (
                            <form action={revokeInvitationAction}>
                              <input type="hidden" name="invitationId" value={String(invitation.id)} />
                              <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">Einladung widerrufen</button>
                            </form>
                          ) : null}
                          <form action={updateCustomerStatusAction} className="flex flex-1 flex-wrap gap-2 sm:justify-end">
                            <input type="hidden" name="customerId" value={customer.id} />
                            <select name="status" defaultValue="" required aria-label={`Status für ${customerName(customer)} ändern`} className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold">
                              <option value="" disabled>Status ändern …</option>
                              <option value="active">Aktiv</option>
                              <option value="inactive">Deaktiviert</option>
                              <option value="archived">Archiviert</option>
                            </select>
                            <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand">Status speichern</button>
                          </form>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <PaginationNav
                  pathname="/admin/customers"
                  query={{ q: queryValue(params, "q"), category: categoryFilter, customerStatus: statusFilter, sort }}
                  page={customerPage.page}
                  totalPages={customerPage.totalPages}
                  totalItems={customerPage.totalItems}
                />
              </>
            ) : (
              <EmptyState title="Keine Kunden gefunden" text="Passen Sie die Filter an oder legen Sie den ersten Kunden an." />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
