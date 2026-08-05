"use client";

import { useEffect } from "react";

export function OfferViewedTracker({ offerVersionId }: { offerVersionId: string }) {
  useEffect(() => {
    void fetch(`/api/offers/${encodeURIComponent(offerVersionId)}/viewed`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      keepalive: true,
    }).catch(() => undefined);
  }, [offerVersionId]);

  return null;
}
