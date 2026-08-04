"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, TriangleAlert } from "lucide-react";
import { loadGooglePlaces } from "@/lib/googleMapsClient";

export type WinterAddressSelection = {
  address: string;
  location: {
    lat: number;
    lng: number;
  };
};

export function WinterAddressSearch({
  apiKey,
  onSelect,
}: {
  apiKey: string;
  onSelect: (selection: WinterAddressSelection) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let active = true;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | null = null;

    async function initialize() {
      try {
        const { PlaceAutocompleteElement } = await loadGooglePlaces(apiKey);
        if (!active || !hostRef.current) return;

        autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ["de"],
          locationBias: {
            center: { lat: 52.3759, lng: 9.732 },
            radius: 50_000,
          },
          placeholder: "Straße, Hausnummer und Ort",
          requestedLanguage: "de",
          requestedRegion: "de",
        });
        autocomplete.className = "hausvia-place-autocomplete";
        autocomplete.description =
          "Geben Sie die Adresse des Objekts ein und wählen Sie einen Vorschlag aus der Liste.";

        autocomplete.addEventListener("gmp-select", async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ["addressComponents", "formattedAddress", "location"] });
            if (!active) return;

            if (!place.location || !place.formattedAddress) {
              throw new Error("Für diese Auswahl konnten keine vollständigen Adressdaten geladen werden.");
            }

            const hasStreet = place.addressComponents?.some((component) => component.types.includes("route"));
            const hasHouseNumber = place.addressComponents?.some((component) =>
              component.types.includes("street_number"),
            );
            if (!hasStreet || !hasHouseNumber) {
              setMessage("Bitte wählen Sie eine vollständige Adresse mit Straße und Hausnummer aus.");
              return;
            }

            onSelectRef.current({
              address: place.formattedAddress,
              location: {
                lat: place.location.lat(),
                lng: place.location.lng(),
              },
            });
            setMessage("");
          } catch {
            setMessage("Die Adresse konnte nicht vollständig geladen werden. Bitte wählen Sie einen anderen Vorschlag.");
          }
        });

        autocomplete.addEventListener("gmp-error", () => {
          setMessage("Der Google-Adressfinder ist gerade nicht erreichbar. Nutzen Sie bitte die manuelle Eingabe.");
          setStatus("error");
        });

        hostRef.current.replaceChildren(autocomplete);
        setStatus("ready");
      } catch {
        if (!active) return;
        setMessage("Der Google-Adressfinder konnte nicht geladen werden. Nutzen Sie bitte die manuelle Eingabe.");
        setStatus("error");
      }
    }

    void initialize();

    return () => {
      active = false;
      autocomplete?.remove();
    };
  }, [apiKey]);

  return (
    <div>
      <div className="relative rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-brand"
        />
        <div ref={hostRef} className="min-h-13 pl-8" />
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center gap-3 rounded-xl bg-white px-4 text-sm font-semibold text-slate-600">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-brand" /> Google-Adressfinder wird geladen …
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950" role="alert">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none" /> {message}
        </p>
      ) : null}
    </div>
  );
}
