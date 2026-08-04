"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMapDrawing } from "@/lib/googleMapsClient";
import { calculateWinterPolygonArea, type WinterMapPoint } from "@/lib/winterMap";

const surfacePalette = ["#37c9d8", "#65b7ef", "#8adbb7", "#f5c542", "#9b8cf2"];

export function WinterAreaResultMap({
  apiKey,
  address,
  polygons,
  totalArea,
  fallbackSnapshot,
}: {
  apiKey: string;
  address: string;
  polygons: WinterMapPoint[][];
  totalArea: number;
  fallbackSnapshot?: string;
}) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const surfaceAreas = useMemo(
    () => polygons.map((polygon) => Math.round(calculateWinterPolygonArea(polygon))),
    [polygons],
  );

  useEffect(() => {
    let active = true;
    const polygonOverlays: google.maps.Polygon[] = [];
    const startPoints: google.maps.Circle[] = [];

    async function initializeMap() {
      if (!apiKey.trim() || polygons.length === 0 || !mapHostRef.current) {
        setStatus("error");
        return;
      }

      try {
        const [mapsLibrary] = await loadGoogleMapDrawing(apiKey);
        if (!active || !mapHostRef.current) return;

        const firstPoint = polygons[0]?.[0];
        if (!firstPoint) {
          setStatus("error");
          return;
        }

        const map = new mapsLibrary.Map(mapHostRef.current, {
          center: firstPoint,
          zoom: 19,
          mapTypeId: "hybrid",
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "none",
          keyboardShortcuts: false,
          maxZoom: 21,
          tilt: 0,
        });
        const bounds = new google.maps.LatLngBounds();

        polygons.forEach((polygon, index) => {
          if (polygon.length < 3) return;
          polygon.forEach((point) => bounds.extend(point));
          const color = surfacePalette[index % surfacePalette.length];

          polygonOverlays.push(
            new mapsLibrary.Polygon({
              map,
              paths: polygon,
              strokeColor: "#082b61",
              strokeOpacity: 1,
              strokeWeight: 9,
              fillOpacity: 0,
              clickable: false,
              zIndex: 1,
            }),
            new mapsLibrary.Polygon({
              map,
              paths: polygon,
              strokeColor: color,
              strokeOpacity: 1,
              strokeWeight: 5,
              fillColor: color,
              fillOpacity: 0.46,
              clickable: false,
              zIndex: 2,
            }),
          );

          startPoints.push(
            new mapsLibrary.Circle({
              map,
              center: polygon[0],
              radius: 1.8,
              fillColor: "#f5c542",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeOpacity: 1,
              strokeWeight: 3,
              clickable: false,
              zIndex: 3,
            }),
          );
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { top: 92, right: 42, bottom: 72, left: 42 });
        }
        setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    }

    void initializeMap();

    return () => {
      active = false;
      polygonOverlays.forEach((polygon) => polygon.setMap(null));
      startPoints.forEach((point) => point.setMap(null));
    };
  }, [apiKey, polygons]);

  const formattedTotalArea = Math.round(totalArea).toLocaleString("de-DE");

  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative min-h-80 bg-slate-100 sm:min-h-[430px]">
        <div
          ref={mapHostRef}
          className={`absolute inset-0 transition-opacity duration-300 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
          role="img"
          aria-label={`Google-Satellitenkarte mit ${polygons.length} markierten Winterdienstflächen an der Adresse ${address}`}
        />

        {status === "loading" ? (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#edf3f9_25%,#f8fafc_25%,#f8fafc_50%,#edf3f9_50%,#edf3f9_75%,#f8fafc_75%)] bg-[length:32px_32px]">
            <span className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-brand shadow-lg">
              Satellitenkarte wird geladen …
            </span>
          </div>
        ) : null}

        {status === "error" && fallbackSnapshot ? (
          <Image
            src={fallbackSnapshot}
            alt={`Flächenskizze mit ${polygons.length} markierten Winterdienstflächen`}
            width={720}
            height={405}
            unoptimized
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:left-5 sm:top-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-brand">Markierte Winterdienstflächen</p>
          <p className="mt-1 truncate text-sm font-bold text-slate-900">{address}</p>
        </div>

        <div className="pointer-events-none absolute bottom-7 right-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white shadow-xl sm:bottom-8 sm:right-5">
          Gesamt: {formattedTotalArea} m² · {polygons.length} {polygons.length === 1 ? "Teilfläche" : "Teilflächen"}
        </div>
      </div>

      <figcaption className="border-t border-slate-200 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {surfaceAreas.map((surfaceArea, index) => (
            <span key={`${index}-${surfaceArea}`} className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-extrabold text-brand">
              Fläche {index + 1} · {surfaceArea.toLocaleString("de-DE")} m²
            </span>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
