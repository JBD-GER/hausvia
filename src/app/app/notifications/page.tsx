import Link from "next/link";
import { Bell } from "lucide-react";
import { markEmployeeNotificationReadAction } from "@/app/actions/portalEmployee";
import {
  PageHeader,
  EmptyState,
  StatusPill,
} from "@/components/portal/PortalUI";
import { formatGermanDate } from "@/lib/portal/core";
import { requireEmployeeContext } from "@/lib/portal/access";

export default async function EmployeeNotificationsPage() {
  const { profile, supabase } = await requireEmployeeContext();
  const { data } = await supabase
    .from("notifications")
    .select(
      "id,type,title,body,property_id,entity_type,entity_id,created_at,read_at",
    )
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader
        eyebrow="Benachrichtigungen"
        title="Neuigkeiten"
        text="Einsätze, Schäden und Equipment in einer kompakten Liste."
        icon={<Bell aria-hidden="true" size={20} />}
        compact
      />
      {data?.length ? (
        <div className="grid gap-3">
          {data.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border p-3.5 shadow-sm sm:p-4 ${item.read_at ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50"}`}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Bell size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-black text-slate-950">{item.title}</h2>
                    {!item.read_at ? <StatusPill>Neu</StatusPill> : null}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    {item.body}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <time className="text-xs font-bold text-slate-400">
                      {formatGermanDate(item.created_at, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <div className="flex flex-wrap justify-end gap-3">
                      {item.property_id ? (
                        <Link
                          href={`/app/properties/${item.property_id}${item.type === "chat.message" || item.entity_type === "property_messages" ? "?view=chat" : ""}`}
                          className="text-xs font-black text-brand underline"
                        >
                          Öffnen
                        </Link>
                      ) : null}
                      {!item.read_at ? (
                        <form action={markEmployeeNotificationReadAction}>
                          <input type="hidden" name="notificationId" value={item.id} />
                          <button className="text-xs font-black text-slate-700 underline">
                            Als gelesen markieren
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Keine Benachrichtigungen"
          text="Wichtige Neuigkeiten erscheinen hier."
        />
      )}
    </>
  );
}
