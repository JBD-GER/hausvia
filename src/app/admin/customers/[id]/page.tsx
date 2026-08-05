import Link from "next/link";
import { notFound } from "next/navigation";
import {
  revokeInvitationAction,
  sendInvitationAction,
} from "@/app/actions/auth";
import {
  updateCustomerAction,
  updateCustomerStatusAction,
} from "@/app/actions/portalAdmin";
import {
  EmptyState,
  Field,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import {
  CUSTOMER_CATEGORY_LABELS,
  PROPERTY_TYPE_LABELS,
  formatGermanDate,
} from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
}>;

const customerStatusLabels: Record<string, string> = {
  active: "Aktiv",
  inactive: "Deaktiviert",
  archived: "Archiviert",
  lead: "Interessent",
};

const invitationStatusLabels: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  accepted: "Angenommen",
  expired: "Abgelaufen",
  revoked: "Widerrufen",
};

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function customerName(customer: Record<string, unknown>) {
  const person = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ");
  return String(
    customer.company_name ||
      person ||
      customer.contact_name ||
      customer.email ||
      "Unbenannter Kunde",
  );
}

function effectiveInvitationStatus(invitation: {
  status: string;
  expires_at: string | null;
}) {
  if (
    invitation.status === "sent" &&
    invitation.expires_at &&
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return "expired";
  }
  return invitation.status;
}

export default async function AdminCustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { admin: supabase } = await requireAdminContext();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (customerError) {
    throw new Error("Die Kundendaten konnten nicht geladen werden.");
  }
  if (!customer) notFound();

  const [invitationResult, propertiesResult] = await Promise.all([
    supabase
      .from("invitations")
      .select(
        "id,email,role,category,status,sent_at,accepted_at,expires_at,revoked_at,created_at",
      )
      .eq("customer_id", id)
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("properties")
      .select(
        "id,name,object_key,property_type,status,care_start_date,created_at,buildings(id,label,formatted_address,status)",
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (invitationResult.error || propertiesResult.error) {
    throw new Error("Das Kundendetail konnte nicht vollständig geladen werden.");
  }

  const invitation = invitationResult.data;
  const invitationStatus = invitation
    ? effectiveInvitationStatus(invitation)
    : "missing";
  const category = customer.category as keyof typeof CUSTOMER_CATEGORY_LABELS;
  const statusMessage = queryValue(query.status);
  const errorMessage = queryValue(query.error);

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/customers"
          className="text-sm font-extrabold text-brand underline"
        >
          Zurück zur Kundenliste
        </Link>
      </div>
      <PageHeader
        eyebrow="Kundendetail"
        title={customerName(customer)}
        text="Stammdaten, Portalzugang und alle verknüpften Immobilien zentral verwalten."
      />

      {statusMessage ? (
        <p
          className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900"
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Stammdaten bearbeiten">
          <form
            action={updateCustomerAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <input type="hidden" name="customerId" value={customer.id} />
            <input
              type="hidden"
              name="updatedAt"
              value={customer.updated_at}
            />
            <Field label="Kundenkategorie">
              <select
                name="category"
                required
                defaultValue={customer.category ?? "private"}
                className={inputClass}
              >
                {Object.entries(CUSTOMER_CATEGORY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Firma (je nach Kategorie)">
              <input
                name="companyName"
                defaultValue={customer.company_name ?? ""}
                autoComplete="organization"
                className={inputClass}
              />
            </Field>
            <Field label="Vorname">
              <input
                name="firstName"
                defaultValue={customer.first_name ?? ""}
                autoComplete="given-name"
                className={inputClass}
              />
            </Field>
            <Field label="Nachname">
              <input
                name="lastName"
                defaultValue={customer.last_name ?? ""}
                autoComplete="family-name"
                className={inputClass}
              />
            </Field>
            <Field label="Ansprechpartner Vorname">
              <input
                name="contactFirstName"
                defaultValue={customer.contact_first_name ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Ansprechpartner Nachname">
              <input
                name="contactLastName"
                defaultValue={customer.contact_last_name ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="E-Mail">
              <input
                name="email"
                type="email"
                required
                readOnly={Boolean(customer.portal_user_id)}
                defaultValue={customer.email}
                autoComplete="email"
                className={`${inputClass} read-only:bg-slate-100 read-only:text-slate-600`}
              />
            </Field>
            <Field label="Telefon">
              <input
                name="phone"
                type="tel"
                required
                defaultValue={customer.phone ?? ""}
                autoComplete="tel"
                className={inputClass}
              />
            </Field>
            <Field label="Straße">
              <input
                name="street"
                required
                defaultValue={customer.billing_street ?? ""}
                autoComplete="address-line1"
                className={inputClass}
              />
            </Field>
            <Field label="Hausnummer">
              <input
                name="houseNumber"
                required
                defaultValue={customer.billing_house_number ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Postleitzahl">
              <input
                name="postalCode"
                required
                inputMode="numeric"
                pattern="[0-9]{5}"
                defaultValue={customer.billing_postal_code ?? ""}
                autoComplete="postal-code"
                className={inputClass}
              />
            </Field>
            <Field label="Ort">
              <input
                name="city"
                required
                defaultValue={customer.billing_city ?? ""}
                autoComplete="address-level2"
                className={inputClass}
              />
            </Field>
            <Field label="Land">
              <input
                name="country"
                required
                defaultValue={customer.billing_country || "Deutschland"}
                autoComplete="country-name"
                className={inputClass}
              />
            </Field>
            <div className="hidden sm:block" />
            <label className="block sm:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Interne Notiz
              </span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={customer.notes ?? ""}
                className={inputClass}
              />
            </label>
            {customer.portal_user_id ? (
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Die Login-E-Mail ist nach Aktivierung des Portalzugangs gesperrt.
              </p>
            ) : null}
            <button className={`${buttonClass} sm:col-span-2`}>
              Stammdaten speichern
            </button>
          </form>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Konto und Status">
            <div className="flex flex-wrap gap-2">
              <StatusPill>
                {customerStatusLabels[customer.status] ?? customer.status}
              </StatusPill>
              <StatusPill>
                Einladung: {invitationStatusLabels[invitationStatus] ?? "Nicht vorhanden"}
              </StatusPill>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="font-bold text-slate-500">Kategorie</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {CUSTOMER_CATEGORY_LABELS[category] ?? customer.category}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Erstellt</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatGermanDate(customer.created_at, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Portalzugang</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {customer.portal_user_id ? "Verknüpft" : "Noch nicht aktiviert"}
                </dd>
              </div>
              {invitation?.expires_at ? (
                <div>
                  <dt className="font-bold text-slate-500">Einladung gültig bis</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {formatGermanDate(invitation.expires_at, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-5 grid gap-3">
              {invitation?.id && invitationStatus !== "accepted" ? (
                <form action={sendInvitationAction}>
                  <input
                    type="hidden"
                    name="invitationId"
                    value={invitation.id}
                  />
                  <button className={buttonClass}>
                    {invitationStatus === "expired"
                      ? "Einladung erneuern"
                      : invitationStatus === "sent"
                        ? "Einladung erneut senden"
                        : "Einladung senden"}
                  </button>
                </form>
              ) : null}
              {invitation?.id && invitationStatus === "sent" ? (
                <form action={revokeInvitationAction}>
                  <input
                    type="hidden"
                    name="invitationId"
                    value={invitation.id}
                  />
                  <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50">
                    Einladung widerrufen
                  </button>
                </form>
              ) : null}
              {!invitation ? (
                <EmptyState
                  title="Keine Einladung"
                  text="Für diesen historischen Kundendatensatz ist keine Einladung hinterlegt."
                />
              ) : null}
            </div>

            <form
              action={updateCustomerStatusAction}
              className="mt-5 grid gap-3 border-t border-slate-200 pt-5"
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <Field label="Kontostatus">
                <select
                  name="status"
                  required
                  defaultValue={
                    customer.status === "archived"
                      ? "archived"
                      : customer.status === "active"
                        ? "active"
                        : "inactive"
                  }
                  className={inputClass}
                >
                  <option value="active">Aktiv</option>
                  <option value="inactive">Deaktiviert</option>
                  <option value="archived">Archiviert</option>
                </select>
              </Field>
              <button className={buttonClass}>Status speichern</button>
            </form>
          </Panel>
        </div>
      </div>

      <div className="mt-5">
        <Panel title={`Zugeordnete Immobilien (${propertiesResult.data?.length ?? 0})`}>
          {propertiesResult.data?.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {propertiesResult.data.map((property) => {
                const propertyType =
                  property.property_type as keyof typeof PROPERTY_TYPE_LABELS;
                const buildings = property.buildings ?? [];
                return (
                  <article
                    key={property.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-slate-950">
                          {property.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {PROPERTY_TYPE_LABELS[propertyType] ?? property.property_type}
                          {property.object_key ? ` · ${property.object_key}` : ""}
                        </p>
                      </div>
                      <StatusPill>{property.status}</StatusPill>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-slate-650">
                      <p>
                        <strong className="text-slate-900">Gebäude:</strong>{" "}
                        {buildings.length}
                      </p>
                      <p>
                        {buildings
                          .map(
                            (building) =>
                              building.label || building.formatted_address,
                          )
                          .filter(Boolean)
                          .join(" · ") || "Keine Adresse hinterlegt"}
                      </p>
                      <p>
                        <strong className="text-slate-900">Betreuungsbeginn:</strong>{" "}
                        {formatGermanDate(`${property.care_start_date}T12:00:00Z`)}
                      </p>
                    </div>
                    <Link
                      href={`/admin/properties/${property.id}`}
                      className={`${buttonClass} mt-4`}
                    >
                      Immobilie öffnen
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine Immobilien zugeordnet"
              text="Sobald eine Immobilie für diesen Kunden angelegt wird, erscheint sie hier."
            />
          )}
        </Panel>
      </div>
    </>
  );
}
