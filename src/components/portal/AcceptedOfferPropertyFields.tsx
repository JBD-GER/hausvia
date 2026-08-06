"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/portal/PortalUI";

type CustomerOption = { id: string; label: string };
type OfferOption = {
  id: string;
  customerId: string;
  number: string;
  title: string;
  objectLabel?: string | null;
  objectAddress?: string | null;
};

function prefillOfferObject(form: HTMLFormElement | null, offer?: OfferOption) {
  if (!form || !offer) return;
  const setValue = (name: string, value?: string | null) => {
    if (!value?.trim()) return;
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = value.trim();
  };
  setValue("name", offer.objectLabel);

  const parts = (offer.objectAddress || "").split(",").map((part) => part.trim()).filter(Boolean);
  const streetMatch = parts[0]?.match(/^(.+?)\s+(\d+[\w/-]*)$/u);
  const cityMatch = parts[1]?.match(/^(\d{5})\s+(.+)$/u);
  if (streetMatch) {
    setValue("street", streetMatch[1]);
    setValue("houseNumber", streetMatch[2]);
  }
  if (cityMatch) {
    setValue("postalCode", cityMatch[1]);
    setValue("city", cityMatch[2]);
  }
  if (parts[2]) setValue("country", parts[2]);
}

export function AcceptedOfferPropertyFields({
  customers,
  offers,
}: {
  customers: CustomerOption[];
  offers: OfferOption[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [offerVersionId, setOfferVersionId] = useState("");
  const matchingOffers = useMemo(
    () => offers.filter((offer) => offer.customerId === customerId),
    [customerId, offers],
  );

  return (
    <>
      <Field label="Kunde" required>
        <select
          name="customerId"
          required
          className={inputClass}
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value);
            setOfferVersionId("");
          }}
        >
          <option value="">Kunde auswählen</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Angenommenes Angebot verknüpfen">
        <select
          name="acceptedOfferVersionId"
          className={inputClass}
          value={offerVersionId}
          disabled={!customerId || matchingOffers.length === 0}
          onChange={(event) => {
            const selectedId = event.target.value;
            setOfferVersionId(selectedId);
            prefillOfferObject(event.currentTarget.form, matchingOffers.find((offer) => offer.id === selectedId));
          }}
        >
          <option value="">
            {!customerId
              ? "Zuerst Kunde auswählen"
              : matchingOffers.length
                ? "Optional: Angebot auswählen"
                : "Kein unverknüpftes Angebot vorhanden"}
          </option>
          {matchingOffers.map((offer) => (
            <option key={offer.id} value={offer.id}>
              {offer.number} · {offer.title}
              {offer.objectLabel ? ` · ${offer.objectLabel}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Nur angenommene, noch nicht verknüpfte Angebote dieses Kunden werden angeboten. Die Leistungen werden atomar mit der Immobilie übernommen.
        </p>
      </Field>
      {offerVersionId ? (
        <Field label="Geltungsbereich der Angebotsleistungen">
          <select name="acceptedOfferScope" defaultValue="property" className={inputClass}>
            <option value="property">Gesamte Immobilie</option>
            <option value="first_building">Nur das erste Gebäude</option>
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">Eine feinere Verteilung auf mehrere Gebäude ist anschließend in der Angebotsdetailseite möglich.</p>
        </Field>
      ) : null}
    </>
  );
}
