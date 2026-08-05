"use client";

import { inputClass } from "@/components/portal/PortalUI";

export type ServiceCatalogOption = {
  id: string;
  name: string;
  category: string;
  customer_description: string | null;
  default_execution_rule: string;
  default_occurrences_per_period: number;
  default_seasonal: boolean;
  default_season_start_month: number | null;
  default_season_end_month: number | null;
  sort_order: number;
};

function field(
  form: HTMLFormElement,
  name: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
    ? element
    : null;
}

export function ServiceCatalogSelect({
  options,
}: {
  options: ServiceCatalogOption[];
}) {
  return (
    <>
      <input type="hidden" name="catalogDefaultsApplied" defaultValue="0" />
      <select
        name="catalogId"
        defaultValue=""
        className={inputClass}
        onChange={(event) => {
          const form = event.currentTarget.form;
          if (!form) return;
          const selected = options.find(
            (option) => option.id === event.currentTarget.value,
          );
          const applied = field(form, "catalogDefaultsApplied");
          if (applied) applied.value = selected ? "1" : "0";
          if (!selected) return;

          const values: Record<string, string> = {
            name: selected.name,
            category: selected.category,
            customerDescription: selected.customer_description ?? "",
            executionRule: selected.default_execution_rule,
            occurrencesPerPeriod: String(
              selected.default_occurrences_per_period,
            ),
            seasonStartMonth: selected.default_season_start_month
              ? String(selected.default_season_start_month)
              : "",
            seasonEndMonth: selected.default_season_end_month
              ? String(selected.default_season_end_month)
              : "",
            sortOrder: String(selected.sort_order),
          };
          for (const [name, value] of Object.entries(values)) {
            const element = field(form, name);
            if (element) element.value = value;
          }
          const seasonal = field(form, "seasonal");
          if (seasonal instanceof HTMLInputElement) {
            seasonal.checked = selected.default_seasonal;
          }
        }}
      >
        <option value="">Individuelle Leistung</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </>
  );
}
