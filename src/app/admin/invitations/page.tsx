import { resendInvitationAction } from "@/app/actions/admin";
import { EmptyState, Field, PageHeader, Panel, StatusPill, buttonClass, inputClass } from "@/components/portal/PortalUI";
import { asText, formatDateTime } from "@/lib/portal/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminInvitationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: invitations } = await supabase
    .from("invitations")
    .select("id,email,role,status,sent_at,accepted_at,created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader eyebrow="Einladungen" title="Portal-Einladungen" text="Invite-only System für Admins, Mitarbeiter und Kunden." />
      <Panel title="Einladung erneut senden">
        <form action={resendInvitationAction} className="grid gap-4 sm:grid-cols-4">
          <Field label="E-Mail"><input name="email" type="email" required className={inputClass} /></Field>
          <Field label="Name"><input name="fullName" className={inputClass} /></Field>
          <Field label="Rolle">
            <select name="role" className={inputClass} defaultValue="customer">
              <option value="customer">Kunde</option>
              <option value="employee">Mitarbeiter</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <button className={`${buttonClass} self-end`}>Senden</button>
        </form>
      </Panel>
      <div className="mt-5">
        <Panel title="Einladungsverlauf">
          {invitations?.length ? (
            <div className="grid gap-3">
              {invitations.map((invite) => (
                <article key={invite.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{invite.email}</p>
                      <p className="mt-1 text-sm text-slate-650">
                        {asText(invite.role)} · gesendet {formatDateTime(invite.sent_at || invite.created_at)}
                      </p>
                    </div>
                    <StatusPill>{invite.status}</StatusPill>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Einladungen" text="Neue Portal-Einladungen erscheinen hier." />
          )}
        </Panel>
      </div>
    </>
  );
}
