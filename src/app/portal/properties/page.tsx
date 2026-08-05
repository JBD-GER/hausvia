import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CircleAlert,
  FileText,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { EmptyState, PageHeader, StatusPill } from "@/components/portal/PortalUI";
import { berlinIsoDate, formatGermanDate } from "@/lib/portal/core";
import { requireCustomerContext } from "@/lib/portal/access";

export default async function CustomerPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { profile, customerId, customer, supabase } =
    await requireCustomerContext();
  let request = supabase
    .from("properties")
    .select(
      "id,name,status,buildings(id,label,formatted_address),visits(id,scheduled_date,completed_at,status),damage_reports(id,status),property_messages(id,created_at,sender_id,message_reads(user_id)),invoices(id,status)",
    )
    .eq("customer_id", customerId)
    .neq("status", "archived")
    .order("name");
  if (q.trim()) {
    request = request.ilike("name", `%${q.trim().slice(0, 100)}%`);
  }
  const { data: properties, error } = await request;
  if (error) {
    throw new Error("Die Immobilienübersicht konnte nicht geladen werden.");
  }
  if (!q.trim() && properties?.length === 1) {
    redirect(`/portal/properties/${properties[0].id}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Kundenportal"
        title={`Ihre Immobilien${customer && !Array.isArray(customer) && (customer.company_name || customer.contact_name) ? ` · ${customer.company_name || customer.contact_name}` : ""}`}
        text="Termine, Leistungsberichte, Schäden, Chat und Rechnungen je Immobilie."
      />
      {(properties?.length ?? 0) > 3 || q ? (
        <form className="mb-5 flex max-w-xl gap-2">
          <label className="sr-only" htmlFor="property-search">
            Immobilie suchen
          </label>
          <input
            id="property-search"
            name="q"
            defaultValue={q}
            placeholder="Immobilie suchen …"
            className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
          />
          <button className="rounded-xl bg-brand px-5 text-sm font-black text-white">
            Suchen
          </button>
        </form>
      ) : null}
      {properties?.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => {
            const today = berlinIsoDate();
            const upcoming = property.visits
              ?.filter(
                (visit) =>
                  visit.scheduled_date >= today && visit.status === "scheduled",
              )
              .sort((left, right) =>
                left.scheduled_date.localeCompare(right.scheduled_date),
              )[0];
            const latestReport = property.visits
              ?.filter((visit) => visit.status === "completed")
              .sort((left, right) =>
                String(right.completed_at || right.scheduled_date).localeCompare(
                  String(left.completed_at || left.scheduled_date),
                ),
              )[0];
            const openDamages =
              property.damage_reports?.filter(
                (damage) => !["resolved", "rejected"].includes(damage.status),
              ).length ?? 0;
            const unreadMessages =
              property.property_messages?.filter(
                (message) =>
                  message.sender_id !== profile.id &&
                  !message.message_reads?.some(
                    (read) => read.user_id === profile.id,
                  ),
              ).length ?? 0;
            const openInvoices =
              property.invoices?.filter((invoice) =>
                ["created", "sent", "open", "overdue", "released"].includes(
                  invoice.status,
                ),
              ).length ?? 0;

            return (
              <Link
                key={property.id}
                href={`/portal/properties/${property.id}`}
                className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-brand hover:shadow-xl"
              >
                <div className="h-2 bg-gradient-to-r from-brand via-blue-500 to-amber-400" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                      <Building2 size={24} aria-hidden="true" />
                    </span>
                    <StatusPill>
                      {property.status === "active" ? "Aktiv" : property.status}
                    </StatusPill>
                  </div>
                  <h2 className="mt-5 text-xl font-black text-slate-950 group-hover:text-brand">
                    {property.name}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {property.buildings?.length ?? 0}{" "}
                    {(property.buildings?.length ?? 0) === 1
                      ? "Gebäude"
                      : "Gebäude"}
                  </p>
                  <div className="mt-3 min-h-12 space-y-1 text-sm text-slate-600">
                    {property.buildings?.slice(0, 2).map((building) => (
                      <p key={building.id} className="flex items-start gap-2">
                        <MapPin
                          size={15}
                          className="mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        {building.label ? `${building.label}: ` : ""}
                        {building.formatted_address}
                      </p>
                    ))}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
                    <span className="rounded-xl bg-slate-50 p-3">
                      <CalendarClock className="mb-1 text-brand" size={18} aria-hidden="true" />
                      {upcoming
                        ? formatGermanDate(`${upcoming.scheduled_date}T12:00:00Z`)
                        : "Kein Termin"}
                    </span>
                    <span className="rounded-xl bg-slate-50 p-3">
                      <CalendarCheck className="mb-1 text-brand" size={18} aria-hidden="true" />
                      {latestReport
                        ? `Bericht ${formatGermanDate(latestReport.completed_at || `${latestReport.scheduled_date}T12:00:00Z`)}`
                        : "Kein Bericht"}
                    </span>
                    <span className="rounded-xl bg-slate-50 p-3">
                      <CircleAlert className="mb-1 text-amber-600" size={18} aria-hidden="true" />
                      {openDamages} offene Schäden
                    </span>
                    <span className="rounded-xl bg-slate-50 p-3">
                      <MessageCircle className="mb-1 text-brand" size={18} aria-hidden="true" />
                      {unreadMessages} neue Nachrichten
                    </span>
                    <span className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                      <FileText className="mb-1 text-brand" size={18} aria-hidden="true" />
                      {openInvoices} offene Rechnungen
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Keine Immobilien gefunden"
          text={
            q
              ? "Bitte passen Sie Ihre Suche an."
              : "Sobald Hausvia eine Immobilie mit Ihrem Kundenkonto verknüpft, erscheint sie hier."
          }
        />
      )}
    </>
  );
}
