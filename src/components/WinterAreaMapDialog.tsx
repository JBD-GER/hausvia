"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CornerDownLeft,
  Loader2,
  MapPinned,
  MousePointer2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { loadGoogleMapDrawing } from "@/lib/googleMapsClient";
import { isSimpleWinterPolygon, sanitizeWinterMapPoints, type WinterMapPoint } from "@/lib/winterMap";

type DrawingResult = {
  area: number;
  points: WinterMapPoint[];
};

function DrawingGuide() {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-brand-dark/85 p-3 backdrop-blur-sm sm:grid sm:place-items-center sm:p-4">
      <div className="mx-auto my-1 w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl sm:my-0 sm:p-7">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">In wenigen Klicks zur Fläche</p>
        <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">So markieren Sie Ihre Winterdienstfläche</h3>

        <div className="relative mt-4 h-28 overflow-hidden rounded-xl border border-brand/15 bg-brand-soft sm:mt-5 sm:h-40" aria-hidden="true">
          <div className="absolute inset-x-0 top-10 h-10 rotate-[-7deg] bg-white/90 shadow-sm" />
          <div className="absolute inset-y-0 left-[62%] w-12 rotate-[8deg] bg-slate-300/70" />
          {[
            { left: "18%", top: "58%", delay: "0s" },
            { left: "42%", top: "46%", delay: "0.7s" },
            { left: "68%", top: "58%", delay: "1.4s" },
            { left: "25%", top: "76%", delay: "2.1s" },
          ].map((point, index) => (
            <span
              key={`${point.left}-${point.top}`}
              className={`animate-hausvia-map-guide-dot absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg ${index === 0 ? "bg-accent" : "bg-brand"}`}
              style={{ left: point.left, top: point.top, animationDelay: point.delay }}
            />
          ))}
          <span className="animate-hausvia-map-guide-pointer absolute left-[16%] top-[52%] text-brand-dark">
            <MousePointer2 className="h-8 w-8 fill-white" />
          </span>
        </div>

        <ol className="mt-4 grid gap-2 text-sm leading-6 text-slate-700 sm:mt-5 sm:grid-cols-3 sm:gap-3">
          {[
            ["1", "Außenkanten markieren", "Tippen oder klicken Sie nacheinander auf die äußeren Ecken der Fläche."],
            ["2", "Fläche abschließen", "Nach mindestens drei Punkten den gelben ersten Punkt anklicken."],
            ["3", "Fläche übernehmen", "Die Quadratmeter werden automatisch berechnet und eingesetzt."],
          ].map(([number, title, text]) => (
            <li key={number} className="grid grid-cols-[1.75rem_1fr] gap-x-3 rounded-xl bg-slate-50 p-2.5 sm:block sm:p-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-xs font-extrabold text-white">{number}</span>
              <div>
                <p className="font-extrabold text-slate-950 sm:mt-2">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600 sm:mt-1">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500">
          Tipp: Auf dem Smartphone verschieben Sie die Karte mit zwei Fingern.
        </p>

      </div>
    </div>
  );
}

export function WinterAreaMapDialog({
  apiKey,
  address,
  location,
  initialPoints,
  showGuide,
  onGuideSeen,
  onClose,
  onUseManual,
  onConfirm,
}: {
  apiKey: string;
  address: string;
  location: WinterMapPoint;
  initialPoints: WinterMapPoint[];
  showGuide: boolean;
  onGuideSeen: () => void;
  onClose: () => void;
  onUseManual: () => void;
  onConfirm: (result: DrawingResult) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const circleListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapsLibraryRef = useRef<google.maps.MapsLibrary | null>(null);
  const sphericalRef = useRef<google.maps.GeometryLibrary["spherical"] | null>(null);
  const pointsRef = useRef<WinterMapPoint[]>([]);
  const closedRef = useRef(false);
  const guideOpenRef = useRef(showGuide);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [guideOpen, setGuideOpen] = useState(showGuide);
  const [points, setPoints] = useState<WinterMapPoint[]>(() => sanitizeWinterMapPoints(initialPoints));
  const [closed, setClosed] = useState(() => sanitizeWinterMapPoints(initialPoints).length >= 3);
  const [measuredArea, setMeasuredArea] = useState(0);
  const polygonIsSimple = !closed || isSimpleWinterPolygon(points);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    closedRef.current = closed;
  }, [closed]);

  useEffect(() => {
    guideOpenRef.current = guideOpen;
  }, [guideOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function initializeMap() {
      try {
        const [mapsLibrary, geometryLibrary] = await loadGoogleMapDrawing(apiKey);
        if (!active || !mapHostRef.current) return;

        mapsLibraryRef.current = mapsLibrary;
        sphericalRef.current = geometryLibrary.spherical;

        const map = new mapsLibrary.Map(mapHostRef.current, {
          center: location,
          zoom: 20,
          mapTypeId: "hybrid",
          mapTypeControl: true,
          mapTypeControlOptions: {
            mapTypeIds: ["roadmap", "hybrid"],
          },
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;

        polylineRef.current = new mapsLibrary.Polyline({
          map,
          strokeColor: "#f5c542",
          strokeOpacity: 1,
          strokeWeight: 4,
          clickable: false,
          zIndex: 2,
        });

        polygonRef.current = new mapsLibrary.Polygon({
          map,
          strokeColor: "#f5c542",
          strokeOpacity: 1,
          strokeWeight: 4,
          fillColor: "#082b61",
          fillOpacity: 0.38,
          clickable: false,
          zIndex: 1,
        });

        mapClickListenerRef.current = map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (guideOpenRef.current || closedRef.current || !event.latLng) return;

          setPoints((current) => {
            if (current.length >= 40) return current;
            return [...current, { lat: event.latLng!.lat(), lng: event.latLng!.lng() }];
          });
        });

        setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    }

    void initializeMap();

    return () => {
      active = false;
      mapClickListenerRef.current?.remove();
      circleListenersRef.current.forEach((listener) => listener.remove());
      circlesRef.current.forEach((circle) => circle.setMap(null));
      polylineRef.current?.setMap(null);
      polygonRef.current?.setMap(null);
    };
  }, [apiKey, location]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsLibrary = mapsLibraryRef.current;
    const polygon = polygonRef.current;
    const polyline = polylineRef.current;
    const spherical = sphericalRef.current;
    if (!map || !mapsLibrary || !polygon || !polyline || !spherical) return;

    polyline.setPath(points);
    polyline.setVisible(!closed && points.length > 0);
    polygon.setPath(points);
    polygon.setVisible(closed && points.length >= 3);
    polygon.setOptions({
      strokeColor: polygonIsSimple ? "#f5c542" : "#dc2626",
      fillColor: polygonIsSimple ? "#082b61" : "#dc2626",
    });

    const area = closed && points.length >= 3 ? spherical.computeArea(points) : 0;
    setMeasuredArea(area);

    circleListenersRef.current.forEach((listener) => listener.remove());
    circlesRef.current.forEach((circle) => circle.setMap(null));
    circleListenersRef.current = [];
    circlesRef.current = points.map((point, index) => {
      const circle = new mapsLibrary.Circle({
        map,
        center: point,
        radius: index === 0 ? 1.8 : 1.2,
        fillColor: index === 0 ? "#f5c542" : "#082b61",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeOpacity: 1,
        strokeWeight: 3,
        clickable: true,
        draggable: true,
        zIndex: 4,
      });

      circleListenersRef.current.push(
        circle.addListener("dragend", () => {
          const center = circle.getCenter();
          if (!center) return;
          setPoints((current) =>
            current.map((currentPoint, currentIndex) =>
              currentIndex === index ? { lat: center.lat(), lng: center.lng() } : currentPoint,
            ),
          );
        }),
      );

      if (index === 0) {
        circleListenersRef.current.push(
          circle.addListener("click", () => {
            if (pointsRef.current.length >= 3) setClosed(true);
          }),
        );
      }

      return circle;
    });
  }, [closed, points, polygonIsSimple, status]);

  function startDrawing() {
    setGuideOpen(false);
    onGuideSeen();
  }

  function resetDrawing() {
    setPoints([]);
    setClosed(false);
  }

  function undoPoint() {
    setClosed(false);
    setPoints((current) => current.slice(0, -1));
  }

  function confirmArea() {
    if (!closed || !polygonIsSimple || measuredArea <= 0) return;
    onConfirm({ area: Math.round(measuredArea), points });
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-6xl overflow-hidden rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/75 sm:w-[calc(100%-2rem)]"
      aria-labelledby="winter-map-title"
    >
      <div className="flex max-h-[calc(100svh-1rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 2 · Fläche markieren</p>
            <h2 id="winter-map-title" className="mt-1 text-xl font-extrabold text-slate-950 sm:text-2xl">
              Winterdienstfläche einzeichnen
            </h2>
            <p className="mt-1 truncate text-xs font-semibold text-slate-600 sm:text-sm">{address}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="Karte schließen"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-[58svh] flex-1 bg-slate-200 sm:min-h-[34rem]">
          <div ref={mapHostRef} className="absolute inset-0" aria-label="Google-Karte zum Markieren der Winterdienstfläche" />

          {status === "loading" ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-white">
              <div className="text-center">
                <Loader2 aria-hidden="true" className="mx-auto h-8 w-8 animate-spin text-brand" />
                <p className="mt-3 text-sm font-bold text-slate-700">Satellitenkarte wird geladen …</p>
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-slate-50 p-5">
              <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-xl">
                <MapPinned aria-hidden="true" className="mx-auto h-10 w-10 text-brand" />
                <h3 className="mt-4 text-xl font-extrabold text-slate-950">Karte gerade nicht verfügbar</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Sie können die Winterdienstfläche ohne Unterbrechung manuell in Quadratmetern eintragen.
                </p>
                <button
                  type="button"
                  onClick={onUseManual}
                  className="mt-5 min-h-12 w-full rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white"
                >
                  Fläche manuell eingeben
                </button>
              </div>
            </div>
          ) : null}

          {status === "ready" && guideOpen ? <DrawingGuide /> : null}

          {status === "ready" && !guideOpen ? (
            <>
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
                <p className="rounded-full bg-brand-dark/92 px-4 py-2 text-center text-xs font-bold text-white shadow-lg backdrop-blur sm:text-sm">
                  {closed
                    ? polygonIsSimple
                      ? "Fertig – die Eckpunkte können noch verschoben werden."
                      : "Die Linien kreuzen sich. Verschieben oder entfernen Sie einen Eckpunkt."
                    : points.length >= 3
                      ? "Jetzt den gelben Startpunkt anklicken, um die Fläche zu schließen."
                      : "Nacheinander alle Ecken der Winterdienstfläche anklicken."}
                </p>
              </div>

              <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:min-w-96">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    {closed && !polygonIsSimple ? "Markierung korrigieren" : closed ? "Berechnete Fläche" : `${points.length} Eckpunkte gesetzt`}
                  </p>
                  <p className={`mt-0.5 text-2xl font-extrabold ${polygonIsSimple ? "text-brand" : "text-red-700"}`} aria-live="polite">
                    {closed && !polygonIsSimple
                      ? "Linien kreuzen sich"
                      : closed
                        ? `${Math.round(measuredArea).toLocaleString("de-DE")} m²`
                        : "Noch nicht geschlossen"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={undoPoint}
                    disabled={!points.length}
                    className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                    aria-label="Letzten Punkt entfernen"
                  >
                    <Undo2 aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={resetDrawing}
                    disabled={!points.length}
                    className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                    aria-label="Markierung zurücksetzen"
                  >
                    <Trash2 aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          {status === "ready" && guideOpen ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onUseManual}
                className="min-h-11 rounded-lg px-4 py-2 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-4"
              >
                Fläche lieber in m² eingeben
              </button>
              <button
                type="button"
                onClick={startDrawing}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
              >
                Zeichnen starten <CornerDownLeft aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setGuideOpen(true);
                }}
                disabled={status !== "ready"}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-slate-650 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" /> Anleitung zeigen
              </button>
              <div className="flex flex-col gap-2 sm:flex-row">
                {!closed && points.length >= 3 ? (
                  <button
                    type="button"
                    onClick={() => setClosed(true)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand px-5 py-3 text-sm font-extrabold text-brand"
                  >
                    Fläche schließen <CornerDownLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={confirmArea}
                  disabled={!closed || !polygonIsSimple || measuredArea <= 0}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Fläche übernehmen <Check aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </dialog>
  );
}
