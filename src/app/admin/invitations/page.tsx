import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
} from "@/components/portal/PortalUI";
import { formatDateTime } from "@/lib/portal/format";
import { requireAdminContext } from "@/lib/portal/access";

const roleLabels: Record<string, string> = {
  customer: "Kunde",
  employee: "Mitarbeiter",
};

const statusLabels: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  accepted: "Angenommen",
  expired: "Abgelaufen",
  revoked: "Widerrufen",
};

export default async function AdminInvitationsPage() {
  const { admin: supabase } = await requireAdminContext();
  const now = new Date().toISOString();
  const { error: expiryError } = await supabase
    .from("invitations")
    .update({ status: "expired" })
    .eq("status", "sent")
    .lt("expires_at", now);
  if (expiryError) {
    throw new Error("Abgelaufene Einladungen konnten nicht aktualisiert werden.");
  }
  const { data: invitations, error } = await supabase
    .from("invitations")
    .select(
      "id,email,role,status,sent_at,accepted_at,expires_at,created_at,customer_id,employee_id",
    )
    .in("role", ["customer", "employee"])
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Der Einladungsverlauf konnte nicht geladen werden.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Einladungen"
        title="Portal-Einladungen"
        text="Einladungen sind fest mit einem zuvor angelegten Kunden oder Mitarbeiter verknüpft und 30 Tage gültig."
      />
      <Panel title="Neue Einladung vorbereiten">
        <p className="text-sm leading-6 text-slate-650">
          Legen Sie zuerst den zugehörigen Stammdatensatz an. Von dort können Sie
          die Einladung kontrolliert senden, erneut senden oder widerrufen.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin/customers" className={buttonClass}>
            Zu den Kunden
          </Link>
          <Link href="/admin/employees" className={buttonClass}>
            Zu den Mitarbeitern
          </Link>
        </div>
      </Panel>
      <div className="mt-5">
        <Panel title="Einladungsverlauf">
          {invitations?.length ? (
            <div className="grid gap-3">
              {invitations.map((invitation) => {
                const targetHref = invitation.customer_id
                  ? `/admin/customers/${invitation.customer_id}`
                  : invitation.employee_id
                    ? `/admin/employees/${invitation.employee_id}`
                    : null;
                return (
                  <article
                    key={invitation.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="break-words font-extrabold text-slate-950">
                          {invitation.email}
                        </p>
                        <p className="mt-1 text-sm text-slate-650">
                          {roleLabels[invitation.role] ?? invitation.role} · erstellt{" "}
                          {formatDateTime(invitation.created_at)}
                        </p>
                        {invitation.expires_at && invitation.status === "sent" ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Gültig bis {formatDateTime(invitation.expires_at)}
                          </p>
                        ) : null}
                        {targetHref ? (
                          <Link
                            href={targetHref}
                            className="mt-3 inline-flex min-h-10 items-center text-sm font-extrabold text-brand underline"
                          >
                            Stammdatensatz öffnen
                          </Link>
                        ) : null}
                      </div>
                      <StatusPill>
                        {statusLabels[invitation.status] ?? invitation.status}
                      </StatusPill>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Keine Einladungen"
              text="Neue Kunden- und Mitarbeitereinladungen erscheinen hier."
            />
          )}
        </Panel>
      </div>
    </>
  );
}
