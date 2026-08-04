"use client";

import Script from "next/script";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getCookieConsentRaw, parseCookieConsent, subscribeCookieConsentChange } from "@/lib/cookieConsent";

const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18131829931";
const leadConversionLabel =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_CONVERSION_LABEL || "p6rgCLT7yr0cEKuJ98VD";
const winterdienstConversionLabel =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_WINTERDIENST_CONVERSION_LABEL || "VMaTCOa13tscEKuJ98VD";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initializeGtag() {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
}

export function GoogleAdsTag() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  const consent = useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);
  const canLoadMarketing = consent?.marketing === true && Boolean(googleAdsId);

  useEffect(() => {
    if (!canLoadMarketing) return;

    initializeGtag();
    window.gtag?.("js", new Date());
    window.gtag?.("config", googleAdsId);
  }, [canLoadMarketing]);

  if (!canLoadMarketing) return null;

  return (
    <Script
      id="hausvia-google-ads-tag"
      src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
      strategy="afterInteractive"
    />
  );
}

export function getGoogleAdsConfig() {
  return {
    googleAdsId,
    leadConversionLabel,
    winterdienstConversionLabel,
  };
}
