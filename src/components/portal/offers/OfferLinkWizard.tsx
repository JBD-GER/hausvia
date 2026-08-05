"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { linkOfferToPropertyAction } from "@/app/actions/offers";
import { buttonClass, inputClass } from "@/components/portal/PortalUI";
import type { OfferPropertyOption } from "@/components/portal/offers/types";

type ItemAssignment = {
  scope: "property" | "buildings";
  buildingIds: string[];
};

export function OfferLinkWizard({
  versionId,
  offerId,
  items,
  properties,
}: {
  versionId: string;
  offerId: string;
  items: Array<{ id: string; title: string }>;
  properties: OfferPropertyOption[];
}) {
  const [propertyId, setPropertyId] = useState("");
  const [assignments, setAssignments] = useState<Record<string, ItemAssignment>>(() => Object.fromEntries(items.map((item) => [item.id, { scope: "property", buildingIds: [] }])));
  const property = properties.find((entry) => entry.id === propertyId);
  const serializedAssignments = useMemo(() => JSON.stringify(items.map((item) => {
    const assignment = assignments[item.id] ?? { scope: "property", buildingIds: [] };
    return { item_id: item.id, scope: assignment.scope, building_ids: assignment.scope === "buildings" ? assignment.buildingIds : [] };
  })), [assignments, items]);
  const invalidBuildingAssignment = items.some((item) => {
    const assignment = assignments[item.id];
    return assignment?.scope === "buildings" && !assignment.buildingIds.length;
  });

  function updateAssignment(itemId: string, patch: Partial<ItemAssignment>) {
    setAssignments((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? { scope: "property", buildingIds: [] }), ...patch },
    }));
  }

  return (
    <form action={linkOfferToPropertyAction} className="grid gap-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="assignments" value={serializedAssignments} />
      <label className="block">
        <span className="text-sm font-bold text-slate-800">Bestehende Immobilie</span>
        <select name="propertyId" required value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setAssignments(Object.fromEntries(items.map((item) => [item.id, { scope: "property", buildingIds: [] }]))); }} className={inputClass}>
          <option value="">Immobilie auswählen</option>
          {properties.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.address ? ` · ${entry.address}` : ""}</option>)}
        </select>
      </label>

      {property ? (
        <div className="grid gap-3">
          <p className="text-sm font-extrabold text-slate-950">Leistungen zuordnen</p>
          {items.map((item) => {
            const assignment = assignments[item.id] ?? { scope: "property", buildingIds: [] };
            return (
              <fieldset key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 text-sm font-extrabold text-slate-900">{item.title}</legend>
                <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold text-slate-750">
                  <label className="flex items-center gap-2"><input type="radio" name={`scope-${item.id}`} checked={assignment.scope === "property"} onChange={() => updateAssignment(item.id, { scope: "property", buildingIds: [] })} className="h-4 w-4 text-brand focus:ring-brand" /> Gesamte Immobilie</label>
                  <label className={`flex items-center gap-2 ${property.buildings.length ? "" : "opacity-50"}`}><input type="radio" name={`scope-${item.id}`} disabled={!property.buildings.length} checked={assignment.scope === "buildings"} onChange={() => updateAssignment(item.id, { scope: "buildings" })} className="h-4 w-4 text-brand focus:ring-brand" /> Ausgewählte Gebäude</label>
                </div>
                {assignment.scope === "buildings" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {property.buildings.map((building) => (
                      <label key={building.id} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-750">
                        <input type="checkbox" checked={assignment.buildingIds.includes(building.id)} onChange={(event) => updateAssignment(item.id, { buildingIds: event.target.checked ? [...assignment.buildingIds, building.id] : assignment.buildingIds.filter((id) => id !== building.id) })} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" /> {building.name}
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
        Beim Verknüpfen werden Leistungen, Flächen, Ausführungsrhythmus, Saisonangaben und die angenommenen Preise in die Immobilie übernommen. Die ursprüngliche Angebotsversion bleibt unverändert.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={!propertyId || invalidBuildingAssignment} className={buttonClass}>Immobilie verknüpfen und Leistungen importieren</button>
        <Link href="/admin/properties" className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline">Immobilien verwalten</Link>
      </div>
    </form>
  );
}
