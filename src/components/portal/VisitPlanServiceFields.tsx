"use client";

import { CheckCircle2, Clock3, ListChecks, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { inputClass } from "@/components/portal/PortalUI";

export type VisitPlanServiceOption = {
  id: string;
  name: string;
  category: string;
  startDate: string;
  estimatedMinutes: number | null;
  seasonLabel: string | null;
};

type VisitPlanServiceFieldsProps = {
  services: readonly VisitPlanServiceOption[];
  initialServiceIds?: readonly string[];
  initialMaxVisitMinutes: number;
  initialAcceptsUnplannedTasks?: boolean;
};

function knownDuration(
  services: readonly VisitPlanServiceOption[],
  selectedIds: ReadonlySet<string>,
) {
  let minutes = 0;
  let unknown = 0;

  for (const service of services) {
    if (!selectedIds.has(service.id)) continue;
    if (service.estimatedMinutes) minutes += service.estimatedMinutes;
    else unknown += 1;
  }

  return { minutes, unknown };
}

function formatIsoDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function VisitPlanServiceFields({
  services,
  initialServiceIds = [],
  initialMaxVisitMinutes,
  initialAcceptsUnplannedTasks = true,
}: VisitPlanServiceFieldsProps) {
  const helpId = useId().replaceAll(":", "");
  const [selectedServiceIds, setSelectedServiceIds] = useState(() =>
    Array.from(new Set(initialServiceIds)),
  );
  const [maxVisitMinutes, setMaxVisitMinutes] = useState(
    initialMaxVisitMinutes,
  );
  const selectedSet = new Set(selectedServiceIds);
  const estimate = knownDuration(services, selectedSet);
  const durationTooShort =
    estimate.minutes > 0 && maxVisitMinutes < estimate.minutes;

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }

  return (
    <section className="col-span-full grid gap-4">
      <fieldset
        aria-describedby={`${helpId}-help`}
        className="rounded-2xl border border-[#08AEB4]/25 bg-gradient-to-br from-[#F4FCFC] to-white p-4 sm:p-5"
      >
        <legend className="px-1 text-sm font-black text-slate-950">
          Leistungen dieses Besuchsplans
        </legend>
        <div className="mt-1 flex items-start gap-3 rounded-xl border border-[#08AEB4]/20 bg-[#E7F8F9] p-3.5 text-[#064A4E]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80">
            <ListChecks aria-hidden="true" size={20} />
          </span>
          <div>
            <p className="text-sm font-black">
              Jeder Plan bekommt seine eigene Checkliste
            </p>
            <p
              id={`${helpId}-help`}
              className="mt-1 text-xs font-semibold leading-5 text-[#08777B]"
            >
              Die gewählten Leistungen erscheinen ab ihrem jeweiligen
              Leistungsbeginn bei jedem Termin dieses Plans. Saisonale
              Leistungen nur innerhalb ihrer Saison.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {services.map((service) => {
            const selected = selectedSet.has(service.id);
            return (
              <label
                key={service.id}
                className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition focus-within:ring-4 focus-within:ring-brand/15 ${
                  selected
                    ? "border-[#08AEB4]/55 bg-[#E7F8F9] shadow-[0_8px_24px_rgba(8,174,180,0.10)]"
                    : "border-slate-200 bg-white hover:border-brand/25 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="serviceId"
                  value={service.id}
                  checked={selected}
                  onChange={() => toggleService(service.id)}
                  className="mt-1 size-5 shrink-0 accent-[#08AEB4]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-extrabold leading-5 text-slate-950">
                      {service.name}
                    </span>
                    {selected ? (
                      <CheckCircle2
                        aria-hidden="true"
                        size={18}
                        className="shrink-0 text-[#087F83]"
                      />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
                    {service.category}
                    {` · aktiv ab ${formatIsoDate(service.startDate)}`}
                    {service.estimatedMinutes
                      ? ` · ca. ${service.estimatedMinutes} Min.`
                      : ""}
                    {service.seasonLabel ? ` · ${service.seasonLabel}` : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div
          className={`mt-4 rounded-xl border px-4 py-3 ${
            selectedServiceIds.length
              ? "border-slate-200 bg-white"
              : "border-amber-200 bg-amber-50"
          }`}
          aria-live="polite"
        >
          <p className="text-sm font-extrabold text-slate-900">
            {selectedServiceIds.length
              ? `${selectedServiceIds.length} ${
                  selectedServiceIds.length === 1 ? "Leistung" : "Leistungen"
                } ausgewählt`
              : "Bitte mindestens eine Leistung auswählen"}
          </p>
          {selectedServiceIds.length ? (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Bekannter Richtwert: ca. {estimate.minutes || 0} Minuten
              {estimate.unknown
                ? ` · ${estimate.unknown} ${
                    estimate.unknown === 1 ? "Leistung" : "Leistungen"
                  } ohne Zeitangabe`
                : ""}
            </p>
          ) : null}
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <label className="block text-sm font-extrabold text-slate-900">
            <span className="flex items-center gap-2">
              <Clock3 aria-hidden="true" size={18} className="text-[#087F83]" />
              Geplante Einsatzdauer in Minuten
            </span>
            <input
              name="maxVisitMinutes"
              type="number"
              min="1"
              max="1440"
              required
              value={maxVisitMinutes}
              onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                setMaxVisitMinutes(
                  Number.isFinite(next)
                    ? Math.max(1, Math.min(1_440, Math.trunc(next)))
                    : 1,
                );
              }}
              className={inputClass}
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p
              className={`text-xs font-semibold leading-5 ${
                durationTooShort ? "text-amber-800" : "text-slate-500"
              }`}
              role={durationTooShort ? "alert" : undefined}
            >
              {durationTooShort
                ? `Der Richtwert liegt bei ca. ${estimate.minutes} Minuten.`
                : "Diese Dauer reserviert der smarte Mitarbeiterkalender."}
            </p>
            {estimate.minutes ? (
              <button
                type="button"
                onClick={() => setMaxVisitMinutes(estimate.minutes)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand/15 bg-brand-soft px-3 text-xs font-extrabold text-brand transition hover:border-brand/30"
              >
                <Sparkles aria-hidden="true" size={15} />
                Richtwert übernehmen
              </button>
            ) : null}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <input
            type="checkbox"
            name="acceptsUnplannedTasks"
            defaultChecked={initialAcceptsUnplannedTasks}
            className="mt-1 size-5 shrink-0 accent-[#08AEB4]"
          />
          <span>
            <span className="block text-sm font-extrabold text-slate-900">
              Schäden und offene Zusatzaufgaben hier einplanen
            </span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
              Für kurze Spezialpläne wie Mülltonnenservice können Sie dies
              ausschalten. Dann bleiben dort nur die oben gewählten Leistungen.
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
