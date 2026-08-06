"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ListChecks,
  MapPin,
  PlayCircle,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";

export type VisitOverviewBuilding = {
  id: string;
  label: string;
  address: string;
};

export type VisitOverviewTask = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  buildingLabel: string | null;
  blockedReason: string | null;
  completedAtLabel: string | null;
  checklist: Array<{
    id: string | null;
    label: string;
    required: boolean;
  }>;
  isDamage: boolean;
  damagePriorityLabel: string | null;
  isCarried: boolean;
  followUpRequired: boolean;
};

export type SelectedVisitOverview = {
  id: string;
  propertyName: string;
  scheduleLabel: string;
  planLabel: string;
  status: string;
  employeeName: string;
  completedLabel: string | null;
  durationLabel: string | null;
  buildings: VisitOverviewBuilding[];
  tasks: VisitOverviewTask[];
};

const visitStatusLabels: Record<string, string> = {
  scheduled: "Geplant",
  started: "Gestartet",
  completed: "Abgeschlossen",
  canceled: "Abgesagt",
};

const taskStatusLabels: Record<string, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  done: "Erledigt",
  blocked: "Nicht ausführbar",
};

const taskStatusStyles: Record<string, string> = {
  open: "border-slate-200 bg-white text-slate-600",
  in_progress: "border-blue-200 bg-blue-50 text-blue-800",
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blocked: "border-amber-200 bg-amber-50 text-amber-900",
};

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "done") {
    return <CheckCircle2 aria-hidden="true" size={17} />;
  }
  if (status === "blocked") {
    return <XCircle aria-hidden="true" size={17} />;
  }
  if (status === "in_progress") {
    return <PlayCircle aria-hidden="true" size={17} />;
  }
  return <Circle aria-hidden="true" size={17} />;
}

function TaskStatus({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-black ${
        taskStatusStyles[status] ?? taskStatusStyles.open
      }`}
    >
      <TaskStatusIcon status={status} />
      {taskStatusLabels[status] ?? status}
    </span>
  );
}

function OverviewMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#087F83] shadow-sm">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-400">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-extrabold leading-5 text-slate-900">
          {value}
        </span>
      </span>
    </div>
  );
}

function CompleteTaskButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#082B61] px-3 text-xs font-black text-white transition hover:bg-[#061F47] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#08AEB4]/25 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
    >
      <CheckCircle2 aria-hidden="true" size={16} />
      {pending ? "Wird gespeichert …" : "Als erledigt markieren"}
    </button>
  );
}

export function SelectedVisitOverviewDialog({
  visit,
  closeHref,
  detailsHref,
  completeTaskAction,
}: {
  visit: SelectedVisitOverview;
  closeHref: string;
  detailsHref: string;
  completeTaskAction: (formData: FormData) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const skipCloseNavigationRef = useRef(false);
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [visit.id]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={() => {
        if (skipCloseNavigationRef.current) return;
        router.replace(closeHref, { scroll: false });
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl overflow-hidden rounded-[1.65rem] border border-white/75 bg-white p-0 text-left text-slate-950 shadow-[0_32px_110px_rgba(3,18,43,0.36)] backdrop:bg-[#03122B]/65 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      <header className="relative shrink-0 overflow-hidden bg-[#082B61] px-4 py-4 text-white sm:px-6 sm:py-5">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-24 size-52 rounded-full bg-[#08AEB4]/25 blur-3xl"
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex min-h-7 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[0.65rem] font-black uppercase tracking-[0.1em] text-cyan-50">
                {visitStatusLabels[visit.status] ?? visit.status}
              </span>
              {visit.status === "completed" ? (
                <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/15 px-2.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-emerald-50">
                  <Check aria-hidden="true" size={13} />
                  Nachweis vorhanden
                </span>
              ) : null}
            </div>
            <h2
              id={titleId}
              className="mt-2 truncate text-xl font-black tracking-[-0.03em] sm:text-2xl"
            >
              {visit.propertyName}
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-sm font-semibold leading-5 text-slate-200"
            >
              {visit.planLabel} · Terminübersicht
            </p>
          </div>
          <form method="dialog">
            <button
              type="submit"
              aria-label="Terminübersicht schließen"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25"
            >
              <X aria-hidden="true" size={21} />
            </button>
          </form>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-4 sm:p-6">
        <section
          aria-label="Einsatzdaten"
          className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <OverviewMetric
            icon={<CalendarDays aria-hidden="true" size={18} />}
            label="Termin"
            value={visit.scheduleLabel}
          />
          <OverviewMetric
            icon={<UserRound aria-hidden="true" size={18} />}
            label="Mitarbeiter"
            value={visit.employeeName}
          />
          <OverviewMetric
            icon={<Clock3 aria-hidden="true" size={18} />}
            label={visit.completedLabel ? "Ausführung" : "Status"}
            value={
              visit.completedLabel
                ? `${visit.completedLabel}${visit.durationLabel ? ` · ${visit.durationLabel}` : ""}`
                : visitStatusLabels[visit.status] ?? visit.status
            }
          />
        </section>

        <section aria-labelledby={`${titleId}-buildings`} className="mt-6">
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" size={18} className="text-[#087F83]" />
            <h3
              id={`${titleId}-buildings`}
              className="text-base font-black tracking-[-0.02em] text-slate-950"
            >
              Adresse und Gebäude
            </h3>
          </div>
          {visit.buildings.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visit.buildings.map((building) => (
                <article
                  key={building.id}
                  className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E7F8F9] text-[#087F83]">
                    <Building2 aria-hidden="true" size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-950">
                      {building.label}
                    </p>
                    <p className="mt-0.5 text-sm leading-5 text-slate-600">
                      {building.address}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              Der Einsatz gilt für die gesamte Immobilie; es ist kein einzelnes Gebäude hinterlegt.
            </p>
          )}
        </section>

        <section aria-labelledby={`${titleId}-tasks`} className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#087F83]">
                <ListChecks aria-hidden="true" size={16} />
                Termin-Checkliste
              </p>
              <h3
                id={`${titleId}-tasks`}
                className="mt-0.5 text-lg font-black tracking-[-0.02em] text-slate-950"
              >
                Leistungen und Aufgaben
              </h3>
              <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-500">
                Angezeigt werden nur die für diesen Termin fälligen Aufgaben.
                Ändern dürfen den Status ausschließlich Mitarbeiter und Admins
                während eines gestarteten Einsatzes.
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
              {visit.tasks.length}
            </span>
          </div>

          {visit.tasks.length ? (
            <div className="mt-3 grid gap-2.5">
              {visit.tasks.map((task) => (
                  <article
                    key={task.id}
                    className={`rounded-2xl border p-4 ${
                      task.isDamage
                        ? "border-amber-200 border-l-4 bg-amber-50/55 shadow-[0_8px_24px_rgba(180,120,0,0.06)]"
                        : "border-slate-200 bg-white shadow-sm"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {task.isDamage ? (
                            <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100/70 px-2.5 text-[0.65rem] font-black uppercase tracking-[0.06em] text-amber-900">
                              <AlertTriangle aria-hidden="true" size={13} />
                              Schadensmeldung
                            </span>
                          ) : null}
                          {task.isCarried ? (
                            <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[0.65rem] font-black text-slate-600">
                              <ArrowDownRight aria-hidden="true" size={13} />
                              Übernommen
                            </span>
                          ) : null}
                          {task.damagePriorityLabel ? (
                            <span className="text-[0.68rem] font-bold text-amber-800">
                              {task.damagePriorityLabel}
                            </span>
                          ) : null}
                        </div>
                        <h4 className="mt-2 text-sm font-black leading-5 text-slate-950 sm:text-base">
                          {task.title}
                        </h4>
                        <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
                          {[task.buildingLabel, task.category]
                            .filter(Boolean)
                            .join(" · ") || "Immobilie gesamt"}
                        </p>
                      </div>
                      <TaskStatus status={task.status} />
                    </div>

                    {task.description ? (
                      <p className="mt-3 text-sm leading-6 text-slate-650">
                        {task.description}
                      </p>
                    ) : null}

                    {task.checklist.length ? (
                      <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/80 p-3">
                        <p className="text-[0.62rem] font-black uppercase tracking-[0.1em] text-slate-400">
                          Prüfpunkte
                        </p>
                        <ul className="mt-2 grid gap-1.5">
                          {task.checklist.map((item, index) => (
                            <li
                              key={item.id ?? `${task.id}-${index}`}
                              className="flex items-start gap-2 text-sm font-semibold leading-5 text-slate-700"
                            >
                              <Check
                                aria-hidden="true"
                                size={15}
                                className="mt-0.5 shrink-0 text-[#087F83]"
                              />
                              <span>
                                {item.label}
                                {item.required ? (
                                  <span className="ml-1 text-xs text-slate-400">
                                    Pflicht
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {task.blockedReason ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                        <strong>Nicht ausführbar:</strong> {task.blockedReason}
                        {task.followUpRequired ? (
                          <span className="mt-1 block text-xs font-bold text-amber-800">
                            Automatisch für den nächsten passenden Termin vorgemerkt.
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {task.isCarried && task.status !== "blocked" ? (
                      <p className="mt-3 text-xs font-bold text-slate-500">
                        Diese Aufgabe wurde aus einem vorherigen Einsatz übernommen.
                      </p>
                    ) : null}
                    {task.completedAtLabel ? (
                      <p className="mt-3 text-xs font-bold text-emerald-700">
                        Erledigt am {task.completedAtLabel}
                      </p>
                    ) : null}
                    {visit.status === "started" && task.status !== "done" ? (
                      <form
                        action={completeTaskAction}
                        className="mt-4 flex justify-end border-t border-slate-200/80 pt-3"
                      >
                        <input type="hidden" name="visitId" value={visit.id} />
                        <input type="hidden" name="taskId" value={task.id} />
                        <CompleteTaskButton />
                      </form>
                    ) : null}
                  </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold leading-6 text-slate-600">
              Für diesen Termin ist nach Leistungs- und Saisonprüfung keine
              Aufgabe fällig.
            </p>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/95 p-3 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4">
        <form method="dialog">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/40 sm:w-auto"
          >
            Schließen
          </button>
        </form>
        <Link
          href={detailsHref}
          scroll
          onClick={() => {
            skipCloseNavigationRef.current = true;
            dialogRef.current?.close();
          }}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#082B61] px-4 text-sm font-extrabold text-white shadow-[0_8px_22px_rgba(8,43,97,0.2)] transition hover:bg-[#061F47] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#08AEB4]/25 sm:w-auto"
        >
          Verwaltung und Bericht öffnen
        </Link>
      </footer>
    </dialog>
  );
}
