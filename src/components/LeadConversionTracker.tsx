"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getCookieConsentRaw, parseCookieConsent, subscribeCookieConsentChange } from "@/lib/cookieConsent";
import { getGoogleAdsConfig, initializeGtag } from "@/components/GoogleAdsTag";

const pendingConversionKey = "hausvia-pending-lead-conversion";

export function markLeadConversionPending(source: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(pendingConversionKey, source);
}

export function LeadConversionTracker() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  const consent = useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (consent?.marketing !== true) return;

    const source = window.sessionStorage.getItem(pendingConversionKey) || "danke-page";

    const { googleAdsId, leadConversionLabel } = getGoogleAdsConfig();
    if (!googleAdsId || !leadConversionLabel) return;

    initializeGtag();
    window.gtag?.("config", googleAdsId);

    window.gtag?.("event", "conversion", {
      send_to: `${googleAdsId}/${leadConversionLabel}`,
      event_category: "lead",
      event_label: "Angebot anfordern",
      conversion_name: "Angebot anfordern",
    });

    window.gtag?.("event", "generate_lead", {
      send_to: googleAdsId,
      event_category: "lead",
      event_label: source,
      lead_source: source,
    });

    firedRef.current = true;
    window.sessionStorage.removeItem(pendingConversionKey);
  }, [consent]);

  return null;
}
