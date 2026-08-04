"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  getCookieConsentRaw,
  parseCookieConsent,
  readCookieConsent,
  subscribeCookieConsentChange,
  type CookieConsent,
} from "@/lib/cookieConsent";
import {
  googleAdsId,
  googleAdsLeadConversionLabel,
  googleAdsWinterdienstConversionLabel,
  normalizeGoogleAdsUserData,
  type GoogleAdsUserData,
  type GoogleAdsUserDataInput,
} from "@/lib/googleAds";

declare global {
  interface Window {
    dataLayer?: Array<IArguments | unknown[] | Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

const winterdienstConversionStoragePrefix = "hausvia-google-ads-winterdienst:";
const pendingWinterdienstConversions = new Set<string>();
const inFlightWinterdienstConversions = new Set<string>();
const pushedWinterdienstCustomEvents = new Set<string>();
const winterdienstConversionAttempts = new Map<string, number>();
const winterdienstConversionTimers = new Map<string, number>();
const winterdienstConversionUserData = new Map<string, GoogleAdsUserData>();
const maximumWinterdienstConversionAttempts = 3;
const winterdienstConversionCallbackTimeoutMs = 4_000;

function normalizeSubmissionId(value: string) {
  const normalized = value.trim();
  return normalized.length >= 8 && normalized.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : "";
}

function hasMarketingConsent() {
  return readCookieConsent()?.marketing === true;
}

function winterdienstConversionStorageKey(submissionId: string) {
  return `${winterdienstConversionStoragePrefix}${submissionId}`;
}

function readWinterdienstConversionStatus(submissionId: string) {
  try {
    return window.sessionStorage.getItem(winterdienstConversionStorageKey(submissionId));
  } catch {
    return null;
  }
}

function persistWinterdienstConversionStatus(submissionId: string, status: "pending" | "sent") {
  if (!hasMarketingConsent()) return;

  try {
    window.sessionStorage.setItem(winterdienstConversionStorageKey(submissionId), status);
  } catch {
    // In-Memory-Deduplizierung und Retry funktionieren auch ohne Session Storage.
  }
}

function collectPendingWinterdienstConversions() {
  const submissionIds = new Set(pendingWinterdienstConversions);

  if (!hasMarketingConsent()) return submissionIds;

  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(winterdienstConversionStoragePrefix)) continue;
      if (window.sessionStorage.getItem(key) !== "pending") continue;

      const submissionId = normalizeSubmissionId(key.slice(winterdienstConversionStoragePrefix.length));
      if (submissionId) submissionIds.add(submissionId);
    }
  } catch {
    // Die aktuelle In-Memory-Liste bleibt weiterhin verwendbar.
  }

  return submissionIds;
}

function completeWinterdienstConversion(submissionId: string) {
  const timer = winterdienstConversionTimers.get(submissionId);
  if (timer) window.clearTimeout(timer);

  winterdienstConversionTimers.delete(submissionId);
  winterdienstConversionAttempts.delete(submissionId);
  inFlightWinterdienstConversions.delete(submissionId);
  pendingWinterdienstConversions.delete(submissionId);
  winterdienstConversionUserData.delete(submissionId);
  persistWinterdienstConversionStatus(submissionId, "sent");
}

function setEnhancedConversionUserData(userData: GoogleAdsUserData | null | undefined) {
  if (!userData || !hasMarketingConsent()) return;

  initializeGtag();
  window.gtag?.("set", "user_data", userData);
}

function dispatchWinterdienstConversion(submissionId: string) {
  if (!hasMarketingConsent()) return;
  if (readWinterdienstConversionStatus(submissionId) === "sent") {
    pendingWinterdienstConversions.delete(submissionId);
    return;
  }
  if (inFlightWinterdienstConversions.has(submissionId)) return;

  const attempts = winterdienstConversionAttempts.get(submissionId) ?? 0;
  if (attempts >= maximumWinterdienstConversionAttempts) return;

  const nextAttempt = attempts + 1;
  const sendTo = `${googleAdsId}/${googleAdsWinterdienstConversionLabel}`;
  winterdienstConversionAttempts.set(submissionId, nextAttempt);
  inFlightWinterdienstConversions.add(submissionId);
  persistWinterdienstConversionStatus(submissionId, "pending");

  initializeGtag();
  window.gtag?.("config", googleAdsId);
  const userData = winterdienstConversionUserData.get(submissionId);
  setEnhancedConversionUserData(userData);

  if (!pushedWinterdienstCustomEvents.has(submissionId)) {
    window.dataLayer?.push({
      event: "winterdienst_conversion",
      event_id: submissionId,
      conversion_name: "Winterdienst",
      conversion_id: googleAdsId,
      conversion_label: googleAdsWinterdienstConversionLabel,
      send_to: sendTo,
      submission_id: submissionId,
      transaction_id: submissionId,
    });
    pushedWinterdienstCustomEvents.add(submissionId);
  }

  window.gtag?.("event", "conversion", {
    send_to: sendTo,
    transaction_id: submissionId,
    event_callback: () => completeWinterdienstConversion(submissionId),
  });
  if (userData) window.gtag?.("set", "user_data", {});

  if (!inFlightWinterdienstConversions.has(submissionId)) return;

  const timer = window.setTimeout(() => {
    winterdienstConversionTimers.delete(submissionId);
    inFlightWinterdienstConversions.delete(submissionId);

    if (!hasMarketingConsent()) return;
    dispatchWinterdienstConversion(submissionId);
  }, winterdienstConversionCallbackTimeoutMs);
  winterdienstConversionTimers.set(submissionId, timer);
}

export function initializeGtag() {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag() {
      // Google dokumentiert für gtag bewusst das native arguments-Objekt als Queue-Eintrag.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
}

export function updateGoogleAdsConsent(consent: CookieConsent | null = readCookieConsent()) {
  initializeGtag();

  const marketingGranted = consent?.marketing === true;
  const analyticsGranted = consent?.analytics === true;
  window.gtag?.("consent", "update", {
    ad_storage: marketingGranted ? "granted" : "denied",
    ad_user_data: marketingGranted ? "granted" : "denied",
    ad_personalization: marketingGranted ? "granted" : "denied",
    analytics_storage: analyticsGranted ? "granted" : "denied",
  });
  if (!marketingGranted) window.gtag?.("set", "user_data", {});
}

export function markWinterdienstConversionPending(value: string, userDataInput?: GoogleAdsUserDataInput) {
  if (typeof window === "undefined") return;

  const submissionId = normalizeSubmissionId(value);
  if (!submissionId) return;
  if (hasMarketingConsent() && readWinterdienstConversionStatus(submissionId) === "sent") return;

  const userData = userDataInput ? normalizeGoogleAdsUserData(userDataInput) : null;
  if (userData) winterdienstConversionUserData.set(submissionId, userData);

  pendingWinterdienstConversions.add(submissionId);
  if (hasMarketingConsent()) persistWinterdienstConversionStatus(submissionId, "pending");
}

export function flushPendingWinterdienstConversions() {
  if (typeof window === "undefined" || !hasMarketingConsent()) return;

  for (const submissionId of collectPendingWinterdienstConversions()) {
    dispatchWinterdienstConversion(submissionId);
  }
}

export function GoogleAdsTag() {
  const rawConsent = useSyncExternalStore(subscribeCookieConsentChange, getCookieConsentRaw, () => "");
  const consent = useMemo(() => parseCookieConsent(rawConsent), [rawConsent]);

  useEffect(() => {
    initializeGtag();
    updateGoogleAdsConsent(consent);
    if (consent?.marketing === true) flushPendingWinterdienstConversions();
  }, [consent]);

  return null;
}

export function getGoogleAdsConfig() {
  return {
    googleAdsId,
    leadConversionLabel: googleAdsLeadConversionLabel,
    winterdienstConversionLabel: googleAdsWinterdienstConversionLabel,
  };
}
