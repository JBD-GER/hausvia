export const cookieConsentStorageKey = "hausvia-cookie-consent-v2";
export const cookieConsentChangeEvent = "hausvia-cookie-consent-change";

export type CookieConsent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  savedAt: string;
};

export function getCookieConsentRaw() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(cookieConsentStorageKey) ?? "";
}

export function parseCookieConsent(raw: string): CookieConsent | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    return {
      necessary: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function readCookieConsent() {
  return parseCookieConsent(getCookieConsentRaw());
}

export function saveCookieConsent(consent: Omit<CookieConsent, "necessary" | "savedAt">) {
  const value: CookieConsent = {
    necessary: true,
    analytics: consent.analytics,
    marketing: consent.marketing,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(cookieConsentStorageKey, JSON.stringify(value));
  window.dispatchEvent(new Event(cookieConsentChangeEvent));
}

export function subscribeCookieConsentChange(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", callback);
  window.addEventListener(cookieConsentChangeEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(cookieConsentChangeEvent, callback);
  };
}
