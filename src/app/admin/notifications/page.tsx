import Link from "next/link";
import { markNotificationReadAction } from "@/app/actions/portalAdmin";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { formatGermanDate } from "@/lib/portal/core";
import { requireAdminContext } from "@/lib/portal/access";
import { paginateItems } from "@/lib/portal/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminNotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { profile, admin: supabase } = await requireAdminContext();
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const unreadOnly = queryValue(params, "unread") === "true";
  const typeFilter = queryValue(params, "type");
  const sort = queryValue(params, "sort") || "newest";
  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false });
  if (notificationsError) {
    throw new Error("Die Benachrichtigungen konnten nicht geladen werden.");
  }
  const types = [...new Set((notifications ?? []).map((notification) => notification.type).filter(Boolean))];
  const filteredNotifications = (notifications ?? []).filter((notification) => {
    const haystack = [notification.title, notification.body, notification.text, notification.type]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de");
    return (!search || haystack.includes(search)) && (!unreadOnly || !notification.read_at) && (!typeFilter || notification.type === typeFilter);
  }).sort((left, right) => {
    if (sort === "oldest") return String(left.created_at).localeCompare(String(right.created_at));
    if (sort === "unread") {
      const unreadDifference = Number(Boolean(left.read_at)) - Number(Boolean(right.read_at));
      if (unreadDifference) return unreadDifference;
    }
    return String(right.created_at).localeCompare(String(left.created_at));
  });
  const notificationPage = paginateItems(filteredNotifications, queryValue(params, "page"));

  return (
    <>
      <PageHeader eyebrow="Benachrichtigungen" title="Aktuelle Hinweise" text="Einsätze, Schäden, Meldungen, Equipment und Abrechnungsereignisse an einem Ort." />
      <Panel title="Filtern">
        <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Suche"><input name="q" defaultValue={queryValue(params, "q")} placeholder="Titel, Text oder Typ …" className={inputClass} /></Field>
          <Field label="Typ"><select name="type" defaultValue={typeFilter} className={inputClass}><option value="">Alle Typen</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
          <Field label="Sortierung"><select name="sort" defaultValue={sort} className={inputClass}><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option><option value="unread">Ungelesene zuerst</option></select></Field>
          <label className="flex min-h-11 items-center gap-2 self-end rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"><input type="checkbox" name="unread" value="true" defaultChecked={unreadOnly} /> nur ungelesene</label>
          <div className="flex items-end gap-2"><button className={buttonClass}>Anwenden</button><Link href="/admin/notifications" className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline">Zurücksetzen</Link></div>
        </form>
      </Panel>
      <div className="mt-5">
        <Panel title={`Benachrichtigungen (${filteredNotifications.length})`}>
          {filteredNotifications.length ? (
            <>
              <div className="grid gap-3">{notificationPage.items.map((notification) => (
                <article key={notification.id} className={`rounded-xl border p-4 ${notification.read_at ? "border-slate-200 bg-slate-50" : "border-brand/25 bg-brand-soft/50"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold text-slate-950">{notification.title}</h2>{!notification.read_at ? <StatusPill>Neu</StatusPill> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notification.body || notification.text}</p><p className="mt-2 text-xs font-bold text-slate-500">{notification.type} · {formatGermanDate(notification.created_at, { hour: "2-digit", minute: "2-digit" })}</p></div>
                    {!notification.read_at ? <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={notification.id} /><button className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:border-brand hover:text-brand">Als gelesen markieren</button></form> : null}
                  </div>
                </article>
              ))}</div>
              <PaginationNav pathname="/admin/notifications" query={{ q: queryValue(params, "q"), type: typeFilter, sort, unread: unreadOnly ? "true" : "" }} page={notificationPage.page} totalPages={notificationPage.totalPages} totalItems={notificationPage.totalItems} />
            </>
          ) : <EmptyState title="Keine Benachrichtigungen" text="Für die gewählten Filter liegen keine Hinweise vor." />}
        </Panel>
      </div>
    </>
  );
}
