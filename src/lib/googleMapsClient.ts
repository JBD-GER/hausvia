import "client-only";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let configuredApiKey = "";

function configureGoogleMaps(apiKey: string) {
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    throw new Error("Der Google-Maps-API-Key ist nicht konfiguriert.");
  }

  if (!configuredApiKey) {
    setOptions({
      key: normalizedApiKey,
      v: "weekly",
      language: "de",
      region: "DE",
      authReferrerPolicy: "origin",
    });
    configuredApiKey = normalizedApiKey;
    return;
  }

  if (configuredApiKey !== normalizedApiKey) {
    throw new Error("Google Maps wurde bereits mit einem anderen API-Key initialisiert.");
  }
}

export async function loadGooglePlaces(apiKey: string) {
  configureGoogleMaps(apiKey);
  return importLibrary("places");
}

export async function loadGoogleMapDrawing(apiKey: string) {
  configureGoogleMaps(apiKey);
  return Promise.all([importLibrary("maps"), importLibrary("geometry")]);
}
