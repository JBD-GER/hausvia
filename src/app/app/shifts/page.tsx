import Link from "next/link";
import { Clock3 } from "lucide-react";
import { CompactSection, EmptyState, PageHeader, StatusPill, buttonClass } from "@/components/portal/PortalUI";
import { asText, firstRelation, formatDateTime } from "@/lib/portal/format";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EmployeeShiftsPage() {
  await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const [{ data: shifts }, { data: tasks }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id,status,started_at,ended_at,gross_minutes,break_minutes,net_minutes,project_id,projects(name,object_address),shift_employee_notes(employee_note)")
      .order("created_at", { ascending: false }),
    supabase.from("project_tasks").select("id,project_id,title,interval_label").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Schichten"
        title="Erfasste Zeiten"
        text="Vergangene Schichten kompakt nach Projekt."
        icon={<Clock3 aria-hidden="true" size={20} />}
        compact
        actions={<Link href="/app/today" className={buttonClass}>Aktuelle Einsätze</Link>}
      />
      <div className="grid gap-3">
        {shifts?.length ? (
          shifts.map((shift) => {
            const projectTasks = (tasks ?? []).filter((task) => task.project_id === shift.project_id);
            return (
              <CompactSection
                key={shift.id}
                title={asText(firstRelation(shift.projects)?.name)}
                description={formatDateTime(shift.started_at)}
                badge={<StatusPill>{shift.status}</StatusPill>}
              >
                <article>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="mt-1 text-sm text-slate-650">
                        Brutto {shift.gross_minutes} Min · Pause {shift.break_minutes} Min · Netto {shift.net_minutes} Min
                      </p>
                    </div>
                  </div>
                  {projectTasks.length ? (
                    <p className="mt-3 text-xs font-bold text-slate-500">
                      {projectTasks.length} hinterlegte Tätigkeit(en)
                    </p>
                  ) : null}
                  <p className="mt-4 rounded-md bg-white p-3 text-sm font-semibold text-slate-700">
                    {asText(firstRelation(shift.shift_employee_notes)?.employee_note || "Keine Notiz hinterlegt.")}
                  </p>
                </article>
              </CompactSection>
            );
          })
        ) : (
          <EmptyState title="Keine Schichten" text="Starten Sie eine Schicht direkt in der Projektansicht." />
        )}
      </div>
    </>
  );
}
