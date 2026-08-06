import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarCheck2,
  FileDown,
  House,
  MessageCircle,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";
import {
  createCustomerComplaintAction,
  createCustomerDamageAction,
  sendCustomerPropertyMessageAction,
} from "@/app/actions/portalCustomer";
import {
  EmptyState,
  Field,
  MetricCard,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import { PropertyChat } from "@/components/portal/PropertyChat";
import { PropertyRealtimeRefresh } from "@/components/portal/PropertyRealtimeRefresh";
import {
  berlinIsoDate,
  formatCents,
  formatGermanDate,
  VISIT_STATUS_LABELS,
} from "@/lib/portal/core";
import { createPrivateAttachmentUrls } from "@/lib/portal/files";
import { requireCustomerContext } from "@/lib/portal/access";
import {
  parseVisitReportSnapshot,
  visitReportPhotos,
} from "@/lib/visitReportSnapshot";

export default async function CustomerPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string; view?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const availableViews = [
    "overview",
    "visits",
    "requests",
    "chat",
    "documents",
  ] as const;
  type PropertyView = (typeof availableViews)[number];
  const activeView: PropertyView = availableViews.includes(
    query.view as PropertyView,
  )
    ? (query.view as PropertyView)
    : "overview";
  const { profile, supabase } = await requireCustomerContext();
  const { data: property } = await supabase
    .from("properties")
    .select(
      "id,name,status,buildings(id,label,formatted_address),property_services(id,name,customer_description,status,seasonal,season_start_month,season_end_month),visits(id,scheduled_date,planned_start_time,status,started_at,completed_at,duration_minutes,report_snapshot,visit_tasks(id,title,status,blocked_reason,customer_visible,visit_task_attachments(id,bucket,path,filename,mime_type)),visit_buildings(buildings(label,formatted_address))),damage_reports(id,building_id,title,description,priority,status,created_at,resolved_at,resolution_note,damage_attachments(id,bucket,path,filename,mime_type)),complaints(id,visit_id,title,description,status,created_at,complaint_attachments(id,bucket,path,filename,mime_type)),invoices(id,invoice_number,status,created_at,service_period_start,service_period_end,net_total_cents,tax_total_cents,gross_total_cents,net_total,tax_total,gross_total,document_path,sent_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();
  const { data: messages } = await supabase
    .from("property_messages")
    .select(
      "id,body,message_type,created_at,sender_id,sender_display_name,message_attachments(id,bucket,path,filename,mime_type),message_reactions(emoji,user_id),message_reads(user_id,read_at)",
    )
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  const now = berlinIsoDate();
  const upcoming =
    property.visits
      ?.filter(
        (visit) => visit.scheduled_date >= now && visit.status === "scheduled",
      )
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)) ?? [];
  const completed =
    property.visits
      ?.filter((visit) => visit.status === "completed")
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)) ?? [];
  const reportByVisitId = new Map(
    completed.map((visit) => [visit.id, parseVisitReportSnapshot(visit.report_snapshot)]),
  );
  const completedVisitById = new Map(
    completed.map((visit) => [visit.id, visit]),
  );
  const openDamages =
    property.damage_reports?.filter(
      (damage) => !["resolved", "rejected"].includes(damage.status),
    ) ?? [];
  const invoiceCents = (newValue: number | null, legacy: number | null) =>
    Number.isInteger(newValue)
      ? Number(newValue)
      : Math.round(Number(legacy ?? 0) * 100);
  const chatMessages = (messages ?? []).slice().reverse();
  const signedAttachmentUrls = await createPrivateAttachmentUrls(
    supabase,
    chatMessages.flatMap((message) => message.message_attachments ?? []),
  );
  const recordAttachmentUrls = await createPrivateAttachmentUrls(
    supabase,
    [
      ...(property.damage_reports ?? []).flatMap(
        (damage) => damage.damage_attachments ?? [],
      ),
      ...(property.complaints ?? []).flatMap(
        (complaint) => complaint.complaint_attachments ?? [],
      ),
      ...completed.flatMap((visit) =>
        (visit.visit_tasks ?? []).flatMap(
          (task) => task.visit_task_attachments ?? [],
        ),
      ),
      ...completed.flatMap((visit) =>
        visitReportPhotos(reportByVisitId.get(visit.id) ?? null),
      ),
    ],
  );
  return (
    <>
      <PropertyRealtimeRefresh propertyId={property.id} />
      <PageHeader
        eyebrow="Immobilie"
        title={property.name}
        text={`${property.buildings?.length ?? 0} Gebäude · ${
          property.status === "active"
            ? "Aktive Betreuung"
            : property.status === "planning"
              ? "In Vorbereitung"
              : property.status === "paused"
                ? "Betreuung pausiert"
                : "Betreuung beendet"
        }`}
        actions={
          <>
            <Link
              href={`/portal/properties/${property.id}?view=chat`}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-black text-white shadow-lg shadow-brand/15 sm:flex-none"
            >
              <MessageCircle size={18} /> Nachricht
            </Link>
            <Link
              href={`/portal/properties/${property.id}?view=requests`}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-brand shadow-sm sm:flex-none"
            >
              <TriangleAlert size={18} /> Schaden melden
            </Link>
          </>
        }
      />
      {query.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          {query.error}
        </p>
      ) : null}
      {query.status ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          {query.status}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Nächste Einsätze"
          value={upcoming.length}
          tone="accent"
        />
        <MetricCard
          label="Leistungen"
          value={
            property.property_services?.filter(
              (service) => service.status === "active",
            ).length ?? 0
          }
        />
        <MetricCard label="Offene Schäden" value={openDamages.length} />
        <MetricCard label="Rechnungen" value={property.invoices?.length ?? 0} />
      </div>
      <nav
        aria-label="Immobilienbereiche"
        className="mt-6 flex snap-x gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_12px_35px_rgba(8,43,97,0.06)]"
      >
        {[
          { id: "overview", label: "Übersicht", icon: House },
          { id: "visits", label: "Einsätze", icon: CalendarCheck2 },
          { id: "requests", label: "Anliegen", icon: TriangleAlert },
          { id: "chat", label: "Chat", icon: MessageCircle },
          { id: "documents", label: "Dokumente", icon: ReceiptText },
        ].map(({ id: view, label, icon: Icon }) => (
          <Link
            key={view}
            href={`/portal/properties/${property.id}?view=${view}`}
            aria-current={activeView === view ? "page" : undefined}
            className={`flex min-h-12 min-w-max snap-start items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-black transition sm:flex-1 ${
              activeView === view
                ? "bg-brand text-white shadow-md shadow-brand/15"
                : "text-slate-600 hover:bg-brand-soft hover:text-brand"
            }`}
          >
            <Icon size={17} /> {label}
          </Link>
        ))}
      </nav>
      <div className="mt-4 grid gap-5">
        <section
          id="uebersicht"
          className={`${activeView === "overview" ? "grid" : "hidden"} gap-5 lg:grid-cols-2`}
        >
          <Panel title="Gebäude & Adressen">
            <div className="grid gap-3">
              {property.buildings?.map((building) => (
                <article
                  key={building.id}
                  className="rounded-xl bg-slate-50 p-4"
                >
                  <p className="flex items-center gap-2 font-black text-slate-950">
                    <Building2 size={18} /> {building.label || "Gebäude"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {building.formatted_address}
                  </p>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Nächste Ausführungen">
            {upcoming.length ? (
              <div className="grid gap-3">
                {upcoming.slice(0, 5).map((visit) => (
                  <article
                    key={visit.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <p className="font-black text-slate-950">
                        {formatGermanDate(`${visit.scheduled_date}T12:00:00Z`, {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                        })}
                      </p>
                      <StatusPill>
                        {VISIT_STATUS_LABELS[visit.status]}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {visit.planned_start_time?.slice(0, 5) ||
                        "Zeitfenster nach Vereinbarung"}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Kein Termin geplant"
                text="Neue Termine erscheinen automatisch nach der Besuchsplanung."
              />
            )}
          </Panel>
        </section>
        <section
          id="leistungen"
          className={activeView === "overview" ? "block" : "hidden"}
        >
          <Panel title="Gebuchte Leistungen">
            <div className="grid gap-3 md:grid-cols-2">
              {property.property_services
                ?.filter((service) => service.status === "active")
                .map((service) => (
                  <article
                    key={service.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <p className="font-black text-slate-950">
                        {service.name}
                      </p>
                      {service.seasonal ? (
                        <StatusPill>
                          Saisonal {service.season_start_month}–
                          {service.season_end_month}
                        </StatusPill>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {service.customer_description ||
                        "Regelmäßige Leistung im vereinbarten Umfang."}
                    </p>
                  </article>
                ))}
            </div>
          </Panel>
        </section>
        <section
          id="einsaetze"
          className={activeView === "visits" ? "block" : "hidden"}
        >
          <Panel title="Abgeschlossene Leistungsberichte">
            {completed.length ? (
              <div className="grid gap-4">
                {completed.slice(0, 12).map((visit) => {
                  const report = reportByVisitId.get(visit.id) ?? null;
                  const liveTasks = (visit.visit_tasks ?? []).filter(
                    (task) => task.customer_visible,
                  );
                  return (
                    <details
                      key={visit.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="font-black text-slate-950">
                          {formatGermanDate(`${report?.scheduledDate || visit.scheduled_date}T12:00:00Z`)}
                        </span>
                        <span className="text-sm font-bold text-slate-500">
                          {report?.durationMinutes ?? visit.duration_minutes ?? 0} Minuten
                        </span>
                      </summary>
                      <div className="mt-4 grid gap-3 text-sm">
                        {report ? (
                          <>
                            <p><strong>Ausgeführt von:</strong> {report.employeeName}</p>
                            <p>
                              <strong>Gebäude:</strong>{" "}
                              {report.buildings.map((building) => building.label || building.address).join(", ") || "Immobilie gesamt"}
                            </p>
                          </>
                        ) : null}
                        <p>
                          <strong>Beginn:</strong>{" "}
                          {report?.startedAt || visit.started_at
                            ? formatGermanDate(report?.startedAt || visit.started_at!, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "–"}
                        </p>
                        <p>
                          <strong>Abschluss:</strong>{" "}
                          {report?.completedAt || visit.completed_at
                            ? formatGermanDate(report?.completedAt || visit.completed_at!, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "–"}
                        </p>
                        <div className="mt-1 grid gap-2">
                          {report
                            ? report.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className={`rounded-lg p-3 ${task.status === "done" ? "bg-emerald-50" : "bg-amber-50"}`}
                                >
                                  <p className="font-bold">{task.title}</p>
                                  {task.description ? <p className="mt-1 text-slate-600">{task.description}</p> : null}
                                  {task.checklist.length ? (
                                    <ul className="mt-2 list-inside list-disc text-slate-600">
                                      {task.checklist.map((item, index) => (
                                        <li key={item.id ?? `${task.id}-${index}`}>{item.label}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {task.blockedReason ? (
                                    <p className="mt-1 text-slate-600">Nicht ausführbar: {task.blockedReason}</p>
                                  ) : null}
                                  {task.photos.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {task.photos.map((photo) => recordAttachmentUrls[photo.id] ? (
                                        <a key={photo.id} href={recordAttachmentUrls[photo.id]} target="_blank" rel="noreferrer" className="font-extrabold text-brand underline">
                                          {photo.filename}
                                        </a>
                                      ) : null)}
                                    </div>
                                  ) : null}
                                </div>
                              ))
                            : liveTasks.map((task) => (
                                <div key={task.id} className={`rounded-lg p-3 ${task.status === "done" ? "bg-emerald-50" : "bg-amber-50"}`}>
                                  <p className="font-bold">{task.title}</p>
                                  {task.blocked_reason ? <p className="mt-1 text-slate-600">Nicht ausführbar: {task.blocked_reason}</p> : null}
                                  {task.visit_task_attachments?.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {task.visit_task_attachments.map((photo: { id: string; filename: string }) => recordAttachmentUrls[photo.id] ? (
                                        <a key={photo.id} href={recordAttachmentUrls[photo.id]} target="_blank" rel="noreferrer" className="font-extrabold text-brand underline">{photo.filename}</a>
                                      ) : null)}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                        </div>
                        {report?.damages.length ? (
                          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="font-black text-slate-900">Dokumentierte Schäden</p>
                            <div className="mt-2 grid gap-2">
                              {report.damages.map((damage) => (
                                <div key={damage.id}>
                                  <p className="font-bold">{damage.title}</p>
                                  {damage.resolutionNote ? <p className="text-slate-600">{damage.resolutionNote}</p> : null}
                                  {damage.photos.map((photo) => recordAttachmentUrls[photo.id] ? (
                                    <a key={photo.id} href={recordAttachmentUrls[photo.id]} target="_blank" rel="noreferrer" className="mr-3 font-extrabold text-brand underline">{photo.filename}</a>
                                  ) : null)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Noch keine Leistungsberichte"
                text="Nach einem abgeschlossenen Einsatz finden Sie hier Beginn, Abschluss und erledigte Aufgaben."
              />
            )}
          </Panel>
        </section>
        <section
          id="schaeden"
          className={`${activeView === "requests" ? "grid" : "hidden"} gap-5 lg:grid-cols-[1.2fr_.8fr]`}
        >
          <Panel title="Schäden">
            <div className="grid gap-3">
              {property.damage_reports?.length ? (
                property.damage_reports.map((damage) => (
                  <article
                    key={damage.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {damage.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {damage.description}
                        </p>
                      </div>
                      <StatusPill>{damage.status}</StatusPill>
                    </div>
                    <time className="mt-2 block text-xs font-bold text-slate-400">
                      {formatGermanDate(damage.created_at)}
                    </time>
                    {damage.resolution_note ? (
                      <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                        {damage.resolution_note}
                      </p>
                    ) : null}
                    {damage.damage_attachments?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {damage.damage_attachments.map((attachment) =>
                          recordAttachmentUrls[attachment.id] ? (
                            <a
                              key={attachment.id}
                              href={recordAttachmentUrls[attachment.id]}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-extrabold text-brand underline"
                            >
                              {attachment.filename}
                            </a>
                          ) : null,
                        )}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <EmptyState
                  title="Keine Schäden"
                  text="Für diese Immobilie sind keine Schäden erfasst."
                />
              )}
            </div>
          </Panel>
          <Panel title="Schaden melden">
            <form
              action={createCustomerDamageAction}
              className="grid gap-3"
            >
              <input type="hidden" name="propertyId" value={property.id} />
              <label className="text-sm font-bold">
                Gebäude
                <select name="buildingId" required className={inputClass}>
                  {property.buildings?.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.label || building.formatted_address}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Titel">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Beschreibung">
                <textarea
                  name="description"
                  required
                  rows={4}
                  className={inputClass}
                />
              </Field>
              <label className="text-sm font-bold">
                Priorität
                <select name="priority" className={inputClass}>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </label>
              <Field label="Bild (optional)">
                <input
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className={inputClass}
                />
              </Field>
              <button className={buttonClass}>Schaden melden</button>
            </form>
          </Panel>
        </section>
        <section
          id="chat"
          className={`${activeView === "chat" ? "grid" : "hidden"} gap-5 lg:grid-cols-[1.2fr_.8fr]`}
        >
          <Panel title="Immobilien-Chat">
            <PropertyChat
              propertyId={property.id}
              currentUserId={profile.id}
              messages={chatMessages}
              signedAttachmentUrls={signedAttachmentUrls}
              sendMessageAction={sendCustomerPropertyMessageAction}
            />
          </Panel>
          <Panel title="Vertrauliche Beschwerde">
            <p className="mb-4 text-sm leading-6 text-slate-600">
              Ihre Beschwerde ist nur für Sie und die Hausvia-Administration
              sichtbar. Mitarbeiter sehen diesen Bereich nicht.
            </p>
            <form
              action={createCustomerComplaintAction}
              className="grid gap-3"
            >
              <input type="hidden" name="propertyId" value={property.id} />
              <Field label="Titel">
                <input name="title" required className={inputClass} />
              </Field>
              <Field label="Beschreibung">
                <textarea
                  name="description"
                  required
                  rows={5}
                  className={inputClass}
                />
              </Field>
              <Field label="Bezug zu einem Einsatz (optional)">
                <select name="visitId" defaultValue="" className={inputClass}>
                  <option value="">Kein bestimmter Einsatz</option>
                  {completed.map((visit) => (
                    <option key={visit.id} value={visit.id}>
                      {formatGermanDate(`${visit.scheduled_date}T12:00:00Z`)}
                      {visit.planned_start_time
                        ? ` · ${visit.planned_start_time.slice(0, 5)} Uhr`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bilder (optional)">
                <input
                  name="images"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className={inputClass}
                />
              </Field>
              <p className="text-xs leading-5 text-slate-500">
                Bis zu 8 Bilder als JPG, PNG, WebP oder HEIC; alle Bilder
                zusammen maximal 4 MB.
              </p>
              <button className={buttonClass}>Vertraulich einreichen</button>
            </form>
            {property.complaints?.length ? (
              <div className="mt-5 grid gap-2">
                {property.complaints.map((complaint) => {
                  const relatedVisit = complaint.visit_id
                    ? completedVisitById.get(complaint.visit_id)
                    : null;
                  return (
                    <div
                      key={complaint.id}
                      className="rounded-xl bg-slate-50 p-3"
                    >
                      <div className="flex justify-between gap-2">
                        <p className="font-bold text-slate-900">
                          {complaint.title}
                        </p>
                        <StatusPill>{complaint.status}</StatusPill>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {formatGermanDate(complaint.created_at)}
                        {relatedVisit
                          ? ` · Einsatz vom ${formatGermanDate(
                              `${relatedVisit.scheduled_date}T12:00:00Z`,
                            )}`
                          : ""}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {complaint.description}
                      </p>
                      {complaint.complaint_attachments?.map((attachment) =>
                        recordAttachmentUrls[attachment.id] ? (
                          <a
                            key={attachment.id}
                            href={recordAttachmentUrls[attachment.id]}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-xs font-extrabold text-brand underline"
                          >
                            {attachment.filename}
                          </a>
                        ) : null,
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Panel>
        </section>
        <section
          id="abrechnung"
          className={activeView === "documents" ? "block" : "hidden"}
        >
          <Panel title="Rechnungen">
            {property.invoices?.length ? (
              <>
                <div className="grid gap-3 md:hidden">
                  {property.invoices.map((invoice) => (
                    <article
                      key={invoice.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                            Rechnung
                          </p>
                          <p className="mt-1 font-black text-slate-950">
                            {invoice.invoice_number || "Entwurf"}
                          </p>
                        </div>
                        <StatusPill>{invoice.status}</StatusPill>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs font-bold text-slate-500">Datum</dt>
                          <dd className="mt-1 font-extrabold text-slate-900">
                            {formatGermanDate(invoice.created_at)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold text-slate-500">Brutto</dt>
                          <dd className="mt-1 font-black text-slate-950">
                            {formatCents(
                              invoiceCents(
                                invoice.gross_total_cents,
                                invoice.gross_total,
                              ),
                            )}
                          </dd>
                        </div>
                      </dl>
                      {invoice.document_path ? (
                        <Link
                          href={`/api/documents/invoices/${invoice.id}`}
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-black text-white"
                        >
                          <FileDown size={17} /> PDF herunterladen
                        </Link>
                      ) : (
                        <p className="mt-4 rounded-xl bg-white p-3 text-center text-xs font-bold text-slate-500">
                          Das PDF wird nach Versand bereitgestellt.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="p-3">Datum</th>
                      <th className="p-3">Nummer</th>
                      <th className="p-3">Leistungszeitraum</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Netto</th>
                      <th className="p-3">USt.</th>
                      <th className="p-3">Brutto</th>
                      <th className="p-3">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {property.invoices.map((invoice) => {
                      return (
                        <tr
                          key={invoice.id}
                          className="border-b border-slate-100"
                        >
                          <td className="p-3">
                            {formatGermanDate(invoice.created_at)}
                          </td>
                          <td className="p-3 font-black">
                            {invoice.invoice_number || "Entwurf"}
                          </td>
                          <td className="p-3">
                            {invoice.service_period_start
                              ? `${formatGermanDate(`${invoice.service_period_start}T12:00:00Z`)}–${formatGermanDate(`${invoice.service_period_end}T12:00:00Z`)}`
                              : "–"}
                          </td>
                          <td className="p-3">
                            <StatusPill>{invoice.status}</StatusPill>
                          </td>
                          <td className="p-3">
                            {formatCents(
                              invoiceCents(invoice.net_total_cents, invoice.net_total),
                            )}
                          </td>
                          <td className="p-3">
                            {formatCents(
                              invoiceCents(invoice.tax_total_cents, invoice.tax_total),
                            )}
                          </td>
                          <td className="p-3 font-black">
                            {formatCents(
                              invoiceCents(
                                invoice.gross_total_cents,
                                invoice.gross_total,
                              ),
                            )}
                          </td>
                          <td className="p-3">
                            {invoice.document_path ? (
                              <Link
                                href={`/api/documents/invoices/${invoice.id}`}
                                className="inline-flex items-center gap-1 font-black text-brand underline"
                              >
                                <FileDown size={16} /> Download
                              </Link>
                            ) : (
                              "–"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState
                title="Keine Rechnungen"
                text="Versendete Rechnungen werden hier sicher bereitgestellt."
              />
            )}
          </Panel>
        </section>
      </div>
    </>
  );
}
