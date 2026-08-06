import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  FilePlus2,
  FileText,
  HandCoins,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
} from "@/components/portal/PortalUI";
import {
  VISIT_STATUS_LABELS,
  berlinIsoDate,
  formatGermanDate,
} from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function reportQueryError(
  area: string,
  error: { message?: string } | null,
) {
  if (error) {
    console.error(`[Hausvia Admin-Dashboard] ${area}:`, error.message ?? error);
  }
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Team";
}

const quickActions: Array<{
  href: string;
  label: string;
  text: string;
  icon: LucideIcon;
}> = [
  {
    href: "/admin/customers",
    label: "Kunde anlegen",
    text: "Stammdaten und Einladung vorbereiten",
    icon: UserPlus,
  },
  {
    href: "/admin/offers/new",
    label: "Angebot erstellen",
    text: "Leistungen kalkulieren und versenden",
    icon: FilePlus2,
  },
  {
    href: "/admin/properties",
    label: "Immobilie verwalten",
    text: "Objekt, Leistungen und Termine planen",
    icon: Building2,
  },
];

const priorityLabels: Record<string, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend",
};

export default async function AdminDashboardPage() {
  const { profile, admin: supabase } = await requireAdminContext();
  const today = berlinIsoDate();

  const [
    activePropertiesResult,
    activeCustomersResult,
    activeEmployeesResult,
    todayVisitsResult,
    openOffersResult,
    outstandingInvoicesResult,
    attentionResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("employee_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("visits")
      .select(
        "id,scheduled_date,planned_start_time,window_start,window_end,status,primary_employee_id,properties(id,name)",
        { count: "exact" },
      )
      .eq("scheduled_date", today)
      .neq("status", "canceled")
      .order("planned_start_time", { ascending: true })
      .limit(6),
    supabase
      .from("offer_versions")
      .select("id,offer_id,title,offer_number,lifecycle_status,updated_at", {
        count: "exact",
      })
      .in("lifecycle_status", ["draft", "sent", "viewed"])
      .or(`lifecycle_status.eq.draft,valid_until.gte.${today}`)
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["released", "open", "overdue"]),
    supabase
      .from("damage_reports")
      .select("id,title,priority,status,created_at,properties(id,name)", {
        count: "exact",
      })
      .in("status", ["new", "reviewed", "scheduled", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  reportQueryError("Aktive Immobilien", activePropertiesResult.error);
  reportQueryError("Aktive Kunden", activeCustomersResult.error);
  reportQueryError("Aktive Mitarbeiter", activeEmployeesResult.error);
  reportQueryError("Heutige Einsätze", todayVisitsResult.error);
  reportQueryError("Offene Angebote", openOffersResult.error);
  reportQueryError("Offene Rechnungen", outstandingInvoicesResult.error);
  reportQueryError("Betriebliche Hinweise", attentionResult.error);

  const todayVisits = todayVisitsResult.error
    ? []
    : (todayVisitsResult.data ?? []);
  const openOffers = openOffersResult.error
    ? []
    : (openOffersResult.data ?? []);
  const attentionItems = attentionResult.error
    ? []
    : (attentionResult.data ?? []);
  const formattedToday = formatGermanDate(`${today}T12:00:00Z`, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <>
      <PageHeader
        eyebrow="Betriebsübersicht"
        title={`Guten Tag, ${firstName(profile.full_name)}.`}
        text={`${formattedToday} · Die wichtigsten Kennzahlen, Termine und offenen Punkte auf einen Blick.`}
      />

      <section
        aria-label="Kennzahlen"
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6"
      >
        <MetricCard
          label="Immobilien aktiv"
          value={activePropertiesResult.error ? "–" : (activePropertiesResult.count ?? 0)}
        />
        <MetricCard
          label="Kunden aktiv"
          value={activeCustomersResult.error ? "–" : (activeCustomersResult.count ?? 0)}
        />
        <MetricCard
          label="Mitarbeiter aktiv"
          value={activeEmployeesResult.error ? "–" : (activeEmployeesResult.count ?? 0)}
        />
        <MetricCard
          label="Einsätze heute"
          value={todayVisitsResult.error ? "–" : (todayVisitsResult.count ?? 0)}
          tone="accent"
        />
        <MetricCard
          label="Angebote offen"
          value={openOffersResult.error ? "–" : (openOffersResult.count ?? 0)}
        />
        <MetricCard
          label="Rechnungen offen"
          value={
            outstandingInvoicesResult.error
              ? "–"
              : (outstandingInvoicesResult.count ?? 0)
          }
        />
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {quickActions.map(({ href, label, text, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-black text-slate-950">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                {text}
              </span>
            </span>
            <ArrowRight
              size={18}
              className="shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand"
              aria-hidden="true"
            />
          </Link>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Heutiger Einsatzplan">
          {todayVisits.length ? (
            <div className="grid gap-3">
              {todayVisits.map((visit) => {
                const property = relation(visit.properties);
                const time =
                  visit.planned_start_time?.slice(0, 5) ||
                  visit.window_start?.slice(0, 5) ||
                  "Flexibel";
                return (
                  <Link
                    key={visit.id}
                    href={`/admin/properties/${property?.id ?? ""}`}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-brand hover:bg-white"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-brand shadow-sm">
                      <CalendarDays size={20} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black text-slate-950 group-hover:text-brand">
                        {property?.name ?? "Immobilie"}
                      </span>
                      <span className="mt-1 block text-xs font-bold text-slate-500">
                        {time} Uhr · {visit.primary_employee_id ? "zugewiesen" : "noch nicht zugewiesen"}
                      </span>
                    </span>
                    <StatusPill>
                      {VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                    </StatusPill>
                  </Link>
                );
              })}
              <Link
                href="/admin/properties"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-700 transition hover:border-brand hover:text-brand"
              >
                Alle Einsätze planen <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <EmptyState
              title="Heute sind keine Einsätze geplant"
              text="Neue Termine können direkt in der jeweiligen Immobilie geplant werden."
            />
          )}
        </Panel>

        <Panel title="Aufmerksamkeit erforderlich">
          {attentionItems.length ? (
            <div className="grid gap-3">
              {attentionItems.map((item) => {
                const property = relation(item.properties);
                const urgent = item.priority === "urgent" || item.priority === "high";
                return (
                  <Link
                    key={item.id}
                    href={property?.id ? `/admin/properties/${property.id}` : "/admin/properties"}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-amber-400 hover:bg-white"
                  >
                    <span
                      className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${urgent ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}
                    >
                      <AlertTriangle size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-black text-slate-950">{item.title}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {property?.name ?? "Immobilie"} · {priorityLabels[item.priority] ?? item.priority}
                      </span>
                    </span>
                  </Link>
                );
              })}
              <p className="text-center text-xs font-bold text-slate-500">
                {attentionResult.count ?? attentionItems.length} offene Meldung(en)
              </p>
            </div>
          ) : (
            <EmptyState
              title="Alles im grünen Bereich"
              text="Aktuell liegen keine offenen Schadensmeldungen vor."
            />
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.55fr]">
        <Panel title="Offene Angebote">
          {openOffers.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {openOffers.map((offer) => (
                <Link
                  key={offer.id}
                  href={`/admin/offers/${offer.offer_id}`}
                  className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-brand hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand shadow-sm">
                      <FileText size={19} aria-hidden="true" />
                    </span>
                    <StatusPill>
                      {offer.lifecycle_status === "draft"
                        ? "Entwurf"
                        : offer.lifecycle_status === "viewed"
                          ? "Angesehen"
                          : "Versendet"}
                    </StatusPill>
                  </div>
                  <p className="mt-3 truncate text-xs font-black uppercase tracking-wide text-brand">
                    {offer.offer_number || "Noch ohne Nummer"}
                  </p>
                  <p className="mt-1 line-clamp-2 font-black text-slate-950 group-hover:text-brand">
                    {offer.title}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Keine offenen Angebote"
              text="Neue Entwürfe und versendete Angebote erscheinen hier."
            />
          )}
        </Panel>

        <aside className="rounded-2xl bg-brand p-5 text-white shadow-lg">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
            <HandCoins size={23} aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-white/65">
            Finanzen
          </p>
          <p className="mt-2 text-3xl font-black">
            {outstandingInvoicesResult.error
              ? "–"
              : (outstandingInvoicesResult.count ?? 0)}
          </p>
          <p className="mt-1 text-sm leading-6 text-white/75">
            Rechnungen warten auf Zahlung oder weitere Bearbeitung.
          </p>
          <Link
            href="/admin/invoices"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-brand transition hover:bg-brand-soft"
          >
            Rechnungen öffnen <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </>
  );
}
