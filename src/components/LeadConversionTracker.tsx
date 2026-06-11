"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getCookieConsentRaw, parseCookieConsent, subscribeCookieConsentChange } from "@/lib/cookieConsent";
import { getGoogleAdsConfig, initializeGtag } from "@/components/GoogleAdsTag";

const pendingConversionKey = "hausvia-pending-lead-conversion";
const firedConversionKey = "hausvia-fired-lead-conversion";

export function markLeadConversionPending(source: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(pendingConversionKey, source);
}

export function LeadConversionTracker() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  const consent = useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);

  useEffect(() => {
    if (consent?.marketing !== true) return;

    const source = window.sessionStorage.getItem(pendingConversionKey);
    const alreadyFired = window.sessionStorage.getItem(firedConversionKey);
    if (!source || alreadyFired === source) return;

    const { googleAdsId, leadConversionLabel } = getGoogleAdsConfig();
    if (!googleAdsId) return;

    initializeGtag();

    window.gtag?.("event", "generate_lead", {
      event_category: "lead",
      event_label: source,
      send_to: googleAdsId,
    });

    if (leadConversionLabel) {
      window.gtag?.("event", "conversion", {
        send_to: `${googleAdsId}/${leadConversionLabel}`,
      });
    }

    window.sessionStorage.setItem(firedConversionKey, source);
    window.sessionStorage.removeItem(pendingConversionKey);
  }, [consent]);

  return null;
}
