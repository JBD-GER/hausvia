"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { billingModeLabels, calculateTotals, formatEuro, normalizeLineItems } from "@/lib/commerce";

export type DocumentEditorOption = {
  id: string;
  label: string;
  customerId?: string;
};

export type DocumentEditorItem = {
  title: string;
  description?: string;
  quantity: number;
  unit: string;
  unitNet: number;
};

export type DocumentEditorInitial = {
  id?: string;
  number?: string | null;
  customerId?: string;
  projectId?: string | null;
  title?: string;
  intro?: string | null;
  closingText?: string | null;
  adminNotes?: string | null;
  billingMode?: string | null;
  billingIntervalLabel?: string | null;
  billingInAdvance?: boolean | null;
  paymentDueDaysBeforeMonthEnd?: number | null;
  dueDate?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  billingNote?: string | null;
  sourceOfferId?: string | null;
  invoiceCycleId?: string | null;
  items: DocumentEditorItem[];
};

const fieldClass =
  "mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

function emptyItem(): DocumentEditorItem {
  return {
    title: "",
    description: "",
    quantity: 1,
    unit: "Pauschale",
    unitNet: 0,
  };
}

function toDecimalInput(value: number) {
  return value ? String(value).replace(".", ",") : "";
}

export function DocumentEditor({
  kind,
  action,
  customers,
  projects,
  initial,
  submitLabel,
}: {
  kind: "offer" | "invoice";
  action: (formData: FormData) => void | Promise<void>;
  customers: DocumentEditorOption[];
  projects: DocumentEditorOption[];
  initial: DocumentEditorInitial;
  submitLabel: string;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  const [items, setItems] = useState<DocumentEditorItem[]>(
    initial.items.length ? initial.items : [emptyItem()],
  );

  const totals = useMemo(
    () =>
      calculateTotals(
        normalizeLineItems(
          items.map((item, index) => ({
            ...item,
            sortOrder: index,
          })),
        ),
      ),
    [items],
  );

  const visibleProjects = projects.filter((project) => !project.customerId || !customerId || project.customerId === customerId);
  const idField = kind === "offer" ? "offerId" : "invoiceId";
  const numberField = kind === "offer" ? "offerNumber" : "invoiceNumber";

  function updateItem(index: number, patch: Partial<DocumentEditorItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    setItems((current) => (current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current));
  }

  return (
    <form action={action} className="grid gap-5">
      {initial.id ? <input type="hidden" name={idField} value={initial.id} /> : null}
      {initial.sourceOfferId ? <input type="hidden" name="sourceOfferId" value={initial.sourceOfferId} /> : null}
      {initial.invoiceCycleId ? <input type="hidden" name="invoiceCycleId" value={initial.invoiceCycleId} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Kunde</span>
          <select name="customerId" required className={fieldClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Kunde auswählen</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Projekt</span>
          <select name="projectId" className={fieldClass} defaultValue={initial.projectId ?? ""}>
            <option value="">ohne Projekt</option>
            {visibleProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">{kind === "offer" ? "Angebotsnummer" : "Rechnungsnummer"}</span>
          <input name={numberField} className={fieldClass} defaultValue={initial.number ?? ""} placeholder="wird automatisch vergeben" />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Titel</span>
          <input name="title" required className={fieldClass} defaultValue={initial.title ?? ""} />
        </label>
      </div>

      {kind === "offer" ? (
        <>
          <label className="block">
            <span className="text-sm font-bold text-slate-800">Einleitung / Angebotsnotiz</span>
            <textarea name="intro" rows={3} className={fieldClass} defaultValue={initial.intro ?? ""} />
          </label>
          <div className="grid gap-4 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Abrechnung</span>
              <select name="billingMode" className={fieldClass} defaultValue={initial.billingMode ?? "one_time"}>
                {Object.entries(billingModeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block lg:col-span-2">
              <span className="text-sm font-bold text-slate-800">Intervall / Vereinbarung</span>
              <input name="billingIntervalLabel" className={fieldClass} defaultValue={initial.billingIntervalLabel ?? ""} placeholder="z. B. wöchentlich, monatlich, nach Plan" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Tage vor Monatsende</span>
              <input name="paymentDueDaysBeforeMonthEnd" inputMode="numeric" className={fieldClass} defaultValue={initial.paymentDueDaysBeforeMonthEnd ?? 15} />
            </label>
          </div>
          <label className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
            <input
              type="checkbox"
              name="billingInAdvance"
              defaultChecked={Boolean(initial.billingInAdvance)}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
            />
            Rechnung für den kommenden Leistungsmonat vor Leistungsbeginn erstellen und Zahlung vorab ausweisen.
          </label>
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Fälligkeitsdatum</span>
              <input name="dueDate" type="date" className={fieldClass} defaultValue={initial.dueDate ?? ""} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Leistungszeitraum von</span>
              <input name="servicePeriodStart" type="date" className={fieldClass} defaultValue={initial.servicePeriodStart ?? ""} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Leistungszeitraum bis</span>
              <input name="servicePeriodEnd" type="date" className={fieldClass} defaultValue={initial.servicePeriodEnd ?? ""} />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-bold text-slate-800">Abrechnungshinweis</span>
            <textarea name="billingNote" rows={3} className={fieldClass} defaultValue={initial.billingNote ?? ""} />
          </label>
        </>
      )}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Positionen</h2>
            <p className="mt-1 text-sm text-slate-650">Menge, Einheit und Netto-Einzelpreis werden mit 19% Umsatzsteuer berechnet.</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-brand/20 bg-white px-3 py-2 text-sm font-extrabold text-brand"
            onClick={() => setItems((current) => [...current, emptyItem()])}
          >
            <Plus aria-hidden="true" size={18} />
            Position hinzufügen
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {items.map((item, index) => (
            <article key={index} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1.6fr_0.55fr_0.7fr_0.75fr_auto] lg:items-end">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Leistung</span>
                  <input
                    name="itemTitle"
                    required
                    className={fieldClass}
                    value={item.title}
                    onChange={(event) => updateItem(index, { title: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Beschreibung</span>
                  <input
                    name="itemDescription"
                    className={fieldClass}
                    value={item.description ?? ""}
                    onChange={(event) => updateItem(index, { description: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Anzahl</span>
                  <input
                    name="quantity"
                    required
                    inputMode="decimal"
                    className={fieldClass}
                    value={toDecimalInput(item.quantity)}
                    onChange={(event) => updateItem(index, { quantity: Number(event.target.value.replace(",", ".")) || 0 })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Einheit</span>
                  <input
                    name="unit"
                    required
                    className={fieldClass}
                    value={item.unit}
                    onChange={(event) => updateItem(index, { unit: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Netto</span>
                  <input
                    name="unitNet"
                    required
                    inputMode="decimal"
                    className={fieldClass}
                    value={toDecimalInput(item.unitNet)}
                    onChange={(event) => updateItem(index, { unitNet: Number(event.target.value.replace(",", ".")) || 0 })}
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-200 px-3 text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={items.length === 1}
                  aria-label="Position entfernen"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 rounded-xl border border-accent bg-accent/12 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Netto</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{formatEuro(totals.netTotal)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">19% Umsatzsteuer</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{formatEuro(totals.taxTotal)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Brutto</p>
          <p className="mt-1 text-2xl font-extrabold text-brand">{formatEuro(totals.grossTotal)}</p>
        </div>
      </div>

      {kind === "offer" ? (
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Abschließende Passage im Angebot</span>
          <textarea
            name="closingText"
            rows={4}
            className={fieldClass}
            defaultValue={initial.closingText ?? ""}
            placeholder="z. B. Hinweis zu Leistungsbeginn, Gültigkeit, Abstimmung vor Ort oder nächstem Schritt."
          />
        </label>
      ) : null}

      {kind === "offer" ? (
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Interne Admin-Notiz</span>
          <textarea name="adminNotes" rows={3} className={fieldClass} defaultValue={initial.adminNotes ?? ""} />
        </label>
      ) : null}

      <button className="min-h-12 rounded-md bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark">
        {submitLabel}
      </button>
    </form>
  );
}
