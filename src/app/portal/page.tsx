import Link from "next/link";
import {
  ArrowRight,
  BadgeEuro,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileText,
  Handshake,
  MapPin,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
} from "@/components/portal/PortalUI";
import {
  berlinIsoDate,
  formatCents,
  formatGermanDate,
} from "@/lib/portal/core";
import { formatEuro } from "@/lib/portal/format";
import { requireCustomerContext } from "@/lib/portal/access";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function reportQueryError(
  area: string,
  error: { message?: string } | null,
) {
  if (error) {
    console.error(`[Hausvia Kunden-Dashboard] ${area}:`, error.message ?? error);
  }
}

const offerStatusLabels: Record<string, string> = {
  sent: "Neu",
  viewed: "Angesehen",
  accepted: "Angenommen",
  linked: "Beauftragt",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
  withdrawn: "Zurückgezogen",
  superseded: "Ersetzt",
};

const invoiceStatusLabels: Record<string, string> = {
  released: "Erstellt",
  open: "Offen",
  paid: "Bezahlt",
  overdue: "Überfällig",
  canceled: "Storniert",
};

export default async function CustomerPortalPage() {
  const { profile, customerId, customer, supabase } =
    await requireCustomerContext();
  const today = berlinIsoDate();

  const [
    propertiesResult,
    upcomingVisitsResult,
    offersResult,
    invoicesResult,
    activeServicesResult,
    careProjectsResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id,name,status,buildings(id,label,formatted_address)")
      .eq("customer_id", customerId)
      .neq("status", "archived")
      .order("name", { ascending: true }),
    supabase
      .from("visits")
      .select(
        "id,scheduled_date,planned_start_time,window_start,window_end,status,properties!inner(id,name,customer_id)",
      )
      .eq("properties.customer_id", customerId)
      .gte("scheduled_date", today)
      .eq("status", "scheduled")
      .order("scheduled_date", { ascending: true })
      .order("planned_start_time", { ascending: true })
      .limit(4),
    supabase
      .from("offer_versions")
      .select(
        "id,offer_number,title,lifecycle_status,offer_date,valid_until,gross_total_cents",
        { count: "exact" },
      )
      .eq("customer_id", customerId)
      .in("lifecycle_status", ["sent", "viewed"])
      .gte("valid_until", today)
      .order("offer_date", { ascending: false })
      .limit(3),
    supabase
      .from("invoices")
      .select(
        "id,status,invoice_number,title,due_date,gross_total,created_at",
        { count: "exact" },
      )
      .eq("customer_id", customerId)
      .in("status", ["released", "open", "overdue"])
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("property_services")
      .select("id,properties!inner(customer_id)", {
        count: "exact",
        head: true,
      })
      .eq("properties.customer_id", customerId)
      .eq("customer_visible", true)
      .eq("status", "active"),
    supabase
      .from("projects")
      .select("id,name,status,object_address", { count: "exact" })
      .eq("customer_id", customerId)
      .in("status", ["planning", "active"])
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  reportQueryError("Immobilien", propertiesResult.error);
  reportQueryError("Nächste Termine", upcomingVisitsResult.error);
  reportQueryError("Offene Angebote", offersResult.error);
  reportQueryError("Offene Rechnungen", invoicesResult.error);
  reportQueryError("Aktive Leistungen", activeServicesResult.error);
  reportQueryError("Betreuungsprojekte", careProjectsResult.error);

  const properties = propertiesResult.error ? [] : (propertiesResult.data ?? []);
  const upcomingVisits = upcomingVisitsResult.error
    ? []
    : (upcomingVisitsResult.data ?? []);
  const offers = offersResult.error ? [] : (offersResult.data ?? []);
  const invoices = invoicesResult.error ? [] : (invoicesResult.data ?? []);
  const careProjects = careProjectsResult.error
    ? []
    : (careProjectsResult.data ?? []);
  const customerRow = relation(customer);
  const customerName =
    customerRow?.company_name ||
    customerRow?.contact_name ||
    profile.full_name ||
    "Willkommen";
  const activeCareCount = Math.max(
    activeServicesResult.error ? 0 : (activeServicesResult.count ?? 0),
    careProjectsResult.error ? 0 : (careProjectsResult.count ?? 0),
  );

  return (
    <>
      <PageHeader
        eyebrow="Kundenübersicht"
        title={`Willkommen, ${customerName}.`}
        text="Alle wichtigen Informationen zu Ihren Immobilien, Terminen, Angeboten und Rechnungen an einem Ort."
      />

      <section
        aria-label="Ihre Übersicht"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <MetricCard
          label="Immobilien"
          value={propertiesResult.error ? "–" : properties.length}
          tone="accent"
        />
        <MetricCard
          label="Offene Angebote"
          value={offersResult.error ? "–" : (offersResult.count ?? 0)}
        />
        <MetricCard
          label="Offene Rechnungen"
          value={invoicesResult.error ? "–" : (invoicesResult.count ?? 0)}
        />
        <MetricCard
          label="Aktive Leistungen"
          value={
            activeServicesResult.error && careProjectsResult.error
              ? "–"
              : activeCareCount
          }
        />
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          href="/portal/properties"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-lg"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Building2 size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-black text-slate-950 group-hover:text-brand">
              Immobilien
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">Details & Chat</span>
          </span>
        </Link>
        <Link
          href="/portal/offers"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-lg"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <FileCheck2 size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-black text-slate-950 group-hover:text-brand">
              Angebote
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">Prüfen & annehmen</span>
          </span>
        </Link>
        <Link
          href="/portal/invoices"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-lg"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <BadgeEuro size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-black text-slate-950 group-hover:text-brand">
              Rechnungen
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">Status & PDF</span>
          </span>
        </Link>
        <Link
          href="/portal/care"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-lg"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Handshake size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-black text-slate-950 group-hover:text-brand">
              Betreuung
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">Leistungen & Einsätze</span>
          </span>
        </Link>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Nächste Termine">
          {upcomingVisits.length ? (
            <div className="grid gap-3">
              {upcomingVisits.map((visit) => {
                const property = relation(visit.properties);
                const time =
                  visit.planned_start_time?.slice(0, 5) ||
                  visit.window_start?.slice(0, 5) ||
                  "flexibel";
                return (
                  <Link
                    key={visit.id}
                    href={property?.id ? `/portal/properties/${property.id}` : "/portal/properties"}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-brand hover:bg-white"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-brand shadow-sm">
                      <CalendarClock size={21} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black text-slate-950 group-hover:text-brand">
                        {property?.name ?? "Immobilie"}
                      </span>
                      <span className="mt-1 block text-xs font-bold text-slate-500">
                        {formatGermanDate(
                          `${visit.scheduled_date}T12:00:00Z`,
                          { weekday: "long", day: "2-digit", month: "long" },
                        )} · {time} Uhr
                      </span>
                    </span>
                    <ArrowRight
                      size={18}
                      className="shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand"
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Aktuell kein Termin geplant"
              text="Sobald ein neuer Einsatz terminiert ist, sehen Sie ihn direkt hier."
            />
          )}
        </Panel>

        <section className="rounded-2xl bg-brand p-5 text-white shadow-lg">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <Sparkles size={23} aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.15em] text-white/65">
            Hausvia Betreuung
          </p>
          <p className="mt-2 text-2xl font-black">Digital. Zuverlässig. Vor Ort.</p>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Termine, Berichte und Dokumente werden transparent in Ihrem Portal zusammengeführt.
          </p>
          <Link
            href="/portal/care"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-brand transition hover:bg-brand-soft"
          >
            Betreuung ansehen <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Ihre Immobilien">
          {properties.length ? (
            <div className="grid gap-3">
              {properties.slice(0, 3).map((property) => {
                const address = property.buildings?.[0]?.formatted_address;
                return (
                  <Link
                    key={property.id}
                    href={`/portal/properties/${property.id}`}
                    className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-brand hover:bg-white"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-brand shadow-sm">
                      <Building2 size={20} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black text-slate-950 group-hover:text-brand">
                        {property.name}
                      </span>
                      <span className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                        <MapPin className="mt-0.5 shrink-0" size={13} aria-hidden="true" />
                        {address || `${property.buildings?.length ?? 0} Gebäude`}
                      </span>
                    </span>
                    <StatusPill>
                      {property.status === "active" ? "Aktiv" : property.status}
                    </StatusPill>
                  </Link>
                );
              })}
              <Link
                href="/portal/properties"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-700 transition hover:border-brand hover:text-brand"
              >
                Alle Immobilien <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <EmptyState
              title="Noch keine Immobilie verknüpft"
              text="Nach der Zuordnung erscheint Ihre Immobilie automatisch in diesem Bereich."
            />
          )}
        </Panel>

        <Panel title="Angebote & Rechnungen">
          <div className="grid gap-5">
            <section aria-labelledby="dashboard-offers">
              <div className="flex items-center justify-between gap-3">
                <h3 id="dashboard-offers" className="flex items-center gap-2 font-black text-slate-950">
                  <FileCheck2 className="text-brand" size={18} aria-hidden="true" />
                  Offene Angebote
                </h3>
                <Link href="/portal/offers" className="text-xs font-black text-brand hover:underline">
                  Alle ansehen
                </Link>
              </div>
              {offers.length ? (
                <div className="mt-3 grid gap-2">
                  {offers.map((offer) => (
                    <Link
                      key={offer.id}
                      href={`/portal/offers/${offer.id}`}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-brand-soft"
                    >
                      <FileText className="shrink-0 text-brand" size={18} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-950">
                          {offer.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {offer.offer_number} · {formatCents(Number(offer.gross_total_cents ?? 0))}
                        </span>
                      </span>
                      <StatusPill>
                        {offerStatusLabels[offer.lifecycle_status] ?? offer.lifecycle_status}
                      </StatusPill>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Aktuell wartet kein Angebot auf Ihre Entscheidung.
                </p>
              )}
            </section>

            <section className="border-t border-slate-200 pt-5" aria-labelledby="dashboard-invoices">
              <div className="flex items-center justify-between gap-3">
                <h3 id="dashboard-invoices" className="flex items-center gap-2 font-black text-slate-950">
                  <BadgeEuro className="text-brand" size={18} aria-hidden="true" />
                  Offene Rechnungen
                </h3>
                <Link href="/portal/invoices" className="text-xs font-black text-brand hover:underline">
                  Alle ansehen
                </Link>
              </div>
              {invoices.length ? (
                <div className="mt-3 grid gap-2">
                  {invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/api/documents/invoices/${invoice.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-brand-soft"
                    >
                      <BadgeEuro className="shrink-0 text-brand" size={18} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-950">
                          {invoice.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {invoice.invoice_number || "Rechnung"} · {formatEuro(invoice.gross_total)}
                        </span>
                      </span>
                      <StatusPill>
                        {invoiceStatusLabels[invoice.status] ?? invoice.status}
                      </StatusPill>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Aktuell sind keine Rechnungen offen.
                </p>
              )}
            </section>
          </div>
        </Panel>
      </div>

      <Panel title="Ihre laufende Betreuung">
        <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-2xl bg-brand-soft p-5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand shadow-sm">
              <Wrench size={21} aria-hidden="true" />
            </span>
            <p className="mt-4 text-3xl font-black text-brand">
              {activeServicesResult.error && careProjectsResult.error
                ? "–"
                : activeCareCount}
            </p>
            <p className="mt-1 text-sm font-bold text-slate-700">
              aktive Leistungen oder Betreuungsobjekte
            </p>
          </div>
          {careProjects.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {careProjects.map((project) => (
                <Link
                  key={project.id}
                  href="/portal/care"
                  className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-brand hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <CheckCircle2 className="text-emerald-600" size={20} aria-hidden="true" />
                    <StatusPill>{project.status === "active" ? "Aktiv" : "In Planung"}</StatusPill>
                  </div>
                  <p className="mt-3 font-black text-slate-950 group-hover:text-brand">
                    {project.name}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {project.object_address || "Objektbetreuung"}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center rounded-2xl border border-dashed border-slate-300 p-5">
              <div>
                <p className="font-black text-slate-950">Ihre Leistungen im Detail</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Vereinbarte Leistungen, Intervalle und freigegebene Einsätze finden Sie in der Betreuung.
                </p>
                <Link
                  href="/portal/care"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-black text-brand hover:underline"
                >
                  Betreuung öffnen <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
