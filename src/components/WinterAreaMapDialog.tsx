"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  CornerDownLeft,
  Layers3,
  Loader2,
  MapPinned,
  Minus,
  Plus,
  PlusCircle,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { loadGoogleMapDrawing } from "@/lib/googleMapsClient";
import {
  calculateWinterPolygonArea,
  findWinterMapPolygonOverlaps,
  isSimpleWinterPolygon,
  sanitizeWinterMapPoints,
  sanitizeWinterMapPolygons,
  winterMapConfig,
  type WinterMapPoint,
} from "@/lib/winterMap";

export type WinterAreaDrawingResult = {
  /** Gerundete Summe aller gültigen Teilflächen in Quadratmetern. */
  area: number;
  /** Übergangsfeld für Aufrufer, die bisher nur ein Polygon gespeichert haben. */
  points: WinterMapPoint[];
  /** Alle getrennten, geschlossenen Teilflächen. */
  polygons: WinterMapPoint[][];
  /** Gerundete Quadratmeter je Polygon, in derselben Reihenfolge wie `polygons`. */
  polygonAreas: number[];
  /** CORS-freie Skizze ohne Google-Kartentiles; fehlt nur, falls Canvas nicht verfügbar ist. */
  snapshotDataUrl?: string;
  snapshotKind?: "schematic-jpeg";
};

type SurfaceDraft = {
  id: number;
  points: WinterMapPoint[];
  closed: boolean;
};

type SurfaceSummary = SurfaceDraft & {
  area: number;
  simple: boolean;
  overlaps: boolean;
  valid: boolean;
};

const surfacePalette = ["#f5c542", "#38bdf8", "#34d399", "#fb7185", "#a78bfa", "#fb923c"];
const maximumSnapshotBytes = 60 * 1024;
const drawingGuidePoints = [
  { x: 16, y: 63 },
  { x: 40, y: 44 },
  { x: 73, y: 56 },
  { x: 65, y: 86 },
  { x: 24, y: 88 },
] as const;
const drawingGuideSequence = [0, 1, 2, 3, 4, 0] as const;

function prepareInitialSurfaces(initialPolygons: WinterMapPoint[][], initialPoints: WinterMapPoint[]) {
  const polygons = sanitizeWinterMapPolygons(initialPolygons);
  if (polygons.length) {
    return polygons.map((points, index) => ({ id: index + 1, points, closed: true } satisfies SurfaceDraft));
  }

  const legacyPoints = sanitizeWinterMapPoints(initialPoints);
  return [
    {
      id: 1,
      points: legacyPoints,
      closed: legacyPoints.length >= 3,
    },
  ] satisfies SurfaceDraft[];
}

function approximateDataUrlBytes(dataUrl: string) {
  const separatorIndex = dataUrl.indexOf(",");
  if (separatorIndex < 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(((dataUrl.length - separatorIndex - 1) * 3) / 4);
}

function fillRoundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
}

function truncateSnapshotText(value: string, maximumLength: number) {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length <= maximumLength ? compact : `${compact.slice(0, maximumLength - 1)}…`;
}

/**
 * Zeichnet ausschließlich eine eigene, schematische Flächenansicht. Google-
 * Kartentiles werden nicht in Canvas kopiert; dadurch bleibt das Canvas CORS-
 * sauber und die Anfrage erhält trotzdem einen visuellen Nachweis aller Flächen.
 */
function createSchematicSnapshotDataUrl(polygons: WinterMapPoint[][], address: string, totalArea: number) {
  try {
    if (typeof document === "undefined") return undefined;

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 405;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return undefined;

    const flattenedPoints = polygons.flat();
    if (!flattenedPoints.length) return undefined;

    const averageLatitude =
      flattenedPoints.reduce((total, point) => total + point.lat, 0) / flattenedPoints.length;
    const longitudeScale = Math.max(Math.cos((averageLatitude * Math.PI) / 180), 0.01);
    const projectedPolygons = polygons.map((polygon) =>
      polygon.map((point) => ({ x: point.lng * longitudeScale, y: -point.lat })),
    );
    const projectedPoints = projectedPolygons.flat();
    const minimumX = Math.min(...projectedPoints.map((point) => point.x));
    const maximumX = Math.max(...projectedPoints.map((point) => point.x));
    const minimumY = Math.min(...projectedPoints.map((point) => point.y));
    const maximumY = Math.max(...projectedPoints.map((point) => point.y));
    const spanX = Math.max(maximumX - minimumX, Number.EPSILON);
    const spanY = Math.max(maximumY - minimumY, Number.EPSILON);
    const drawingBounds = { left: 30, top: 82, width: 660, height: 270 };
    const scale = Math.min(drawingBounds.width / spanX, drawingBounds.height / spanY);
    const renderedWidth = spanX * scale;
    const renderedHeight = spanY * scale;
    const offsetX = drawingBounds.left + (drawingBounds.width - renderedWidth) / 2;
    const offsetY = drawingBounds.top + (drawingBounds.height - renderedHeight) / 2;

    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#e2e8f0";
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 30) {
      context.beginPath();
      context.moveTo(x, 72);
      context.lineTo(x, 365);
      context.stroke();
    }
    for (let y = 82; y <= 352; y += 30) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }

    context.fillStyle = "#082b61";
    context.font = "700 22px Arial, sans-serif";
    context.fillText("Markierte Winterdienstflächen", 24, 30);
    context.fillStyle = "#475569";
    context.font = "14px Arial, sans-serif";
    context.fillText(truncateSnapshotText(address, 88), 24, 55);

    projectedPolygons.forEach((polygon, index) => {
      const renderedPoints = polygon.map((point) => ({
        x: offsetX + (point.x - minimumX) * scale,
        y: offsetY + (point.y - minimumY) * scale,
      }));
      const color = surfacePalette[index % surfacePalette.length];
      context.beginPath();
      renderedPoints.forEach((point, pointIndex) => {
        if (pointIndex === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.globalAlpha = 0.42;
      context.fillStyle = color;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = "#082b61";
      context.lineWidth = 4;
      context.lineJoin = "round";
      context.stroke();

      context.beginPath();
      context.arc(renderedPoints[0].x, renderedPoints[0].y, 7, 0, Math.PI * 2);
      context.fillStyle = "#f5c542";
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 3;
      context.stroke();

      const labelX = renderedPoints.reduce((total, point) => total + point.x, 0) / renderedPoints.length;
      const labelY = renderedPoints.reduce((total, point) => total + point.y, 0) / renderedPoints.length;
      const label = `Fläche ${index + 1} · ${Math.round(calculateWinterPolygonArea(polygons[index]))} m²`;
      context.font = "700 13px Arial, sans-serif";
      const labelWidth = Math.ceil(context.measureText(label).width) + 22;
      const safeLabelX = Math.max(labelWidth / 2 + 8, Math.min(canvas.width - labelWidth / 2 - 8, labelX));
      const safeLabelY = Math.max(92, Math.min(344, labelY));
      context.fillStyle = "rgba(8, 43, 97, 0.94)";
      fillRoundedRectangle(context, safeLabelX - labelWidth / 2, safeLabelY - 15, labelWidth, 30, 10);
      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, safeLabelX, safeLabelY + 1);
      context.textAlign = "start";
      context.textBaseline = "alphabetic";
    });

    const summary = `Gesamt: ${Math.round(totalArea).toLocaleString("de-DE")} m² · ${polygons.length} ${polygons.length === 1 ? "Fläche" : "Teilflächen"}`;
    context.font = "700 15px Arial, sans-serif";
    const summaryWidth = Math.ceil(context.measureText(summary).width) + 28;
    context.fillStyle = "#082b61";
    fillRoundedRectangle(context, canvas.width - summaryWidth - 20, 365, summaryWidth, 28, 10);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(summary, canvas.width - summaryWidth / 2 - 20, 380);

    for (const quality of [0.72, 0.64, 0.56, 0.48, 0.4]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (approximateDataUrlBytes(dataUrl) <= maximumSnapshotBytes) return dataUrl;
    }
  } catch {
    // Die Flächenkoordinaten bleiben auch ohne optionales Vorschaubild erhalten.
  }

  return undefined;
}

function DrawingGuide({ onUnderstood, onUseManual }: { onUnderstood: () => void; onUseManual: () => void }) {
  const [animationStep, setAnimationStep] = useState(0);
  const activePointIndex = drawingGuideSequence[animationStep];
  const pointerPoint = drawingGuidePoints[activePointIndex];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const intervalId = window.setInterval(() => {
      setAnimationStep((current) => (current + 1) % drawingGuideSequence.length);
    }, 950);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-brand-dark/88 p-3 backdrop-blur-sm sm:grid sm:place-items-center sm:p-4">
      <div className="mx-auto my-1 w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl sm:my-0 sm:p-6">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">In wenigen Klicks zur Fläche</p>
        <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">So markieren Sie Ihre Winterdienstfläche</h3>
        <button
          type="button"
          onClick={onUnderstood}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark"
        >
          Verstanden <Check aria-hidden="true" className="h-4 w-4" />
        </button>

        <div className="mt-4 rounded-xl border border-brand/15 bg-brand-soft p-3 sm:p-4">
          <p className="text-sm font-extrabold leading-6 text-slate-950">
            Nur tatsächlich zu räumende oder zu streuende Flächen markieren
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-650">
            Zeichnen Sie die Außenkanten von Gehwegen, Eingängen und Zufahrten nach. Gebäude, Rasen und Beete bleiben außerhalb.
          </p>
          <div className="relative mt-3 h-28 overflow-hidden rounded-lg bg-slate-300" aria-hidden="true">
            <div className="absolute inset-x-[-8%] top-[42%] h-9 rotate-[-5deg] bg-white shadow-sm" />
            <div className="absolute inset-y-[-15%] left-[65%] w-11 rotate-[7deg] bg-slate-100 shadow-sm" />
            <div
              className={`absolute inset-0 bg-brand-dark transition-opacity duration-500 ${animationStep === drawingGuideSequence.length - 1 ? "opacity-100" : "opacity-55"}`}
              style={{ clipPath: "polygon(16% 63%, 40% 44%, 73% 56%, 65% 86%, 24% 88%)" }}
            />
            <div
              className={`absolute inset-0 bg-accent transition-opacity duration-500 ${animationStep === drawingGuideSequence.length - 1 ? "opacity-65" : "opacity-25"}`}
              style={{ clipPath: "polygon(18% 64%, 41% 47%, 70.5% 58%, 63% 83%, 26% 85%)" }}
            />
            {drawingGuidePoints.map((point, index) => (
              <span
                key={`${point.x}-${point.y}`}
                className={`absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md transition duration-300 ${index === 0 ? "bg-accent" : "bg-brand"} ${index === activePointIndex ? "scale-125 ring-4 ring-accent/35" : "scale-100"}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            ))}
            <span
              className="absolute z-20 h-7 w-5 -translate-x-full -translate-y-full transition-[left,top] duration-700 ease-in-out drop-shadow-lg"
              style={{ left: `${pointerPoint.x}%`, top: `${pointerPoint.y}%` }}
            >
              <span
                className="block h-full w-full bg-white"
                style={{
                  clipPath: "polygon(0 0, 100% 68%, 57% 73%, 43% 100%, 30% 78%, 0 94%)",
                  transform: "rotate(180deg)",
                }}
              />
            </span>
            <span className="absolute bottom-2 left-2 rounded-md bg-brand-dark/92 px-2.5 py-1 text-[10px] font-extrabold text-white">
              {animationStep === drawingGuideSequence.length - 1
                ? "Gelben Startpunkt wählen · 42 m²"
                : `Eckpunkt ${animationStep + 1} setzen`}
            </span>
            <span className="absolute bottom-2 right-2 rounded-md bg-white/95 px-2.5 py-1 text-xs font-extrabold text-brand shadow">
              42 m²
            </span>
          </div>
        </div>

        <ol className="mt-4 grid gap-2 text-xs leading-5 text-slate-650 sm:grid-cols-3">
          <li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-950">1. Ecken setzen</strong>Auf die äußeren Ecken tippen oder klicken.</li>
          <li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-950">2. Gelben Punkt wählen</strong>Damit schließen Sie eine Teilfläche exakt.</li>
          <li className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-950">3. Weitere Fläche</strong>Getrennte Bereiche einzeln hinzufügen.</li>
        </ol>

        <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500">
          Karte mit einem Finger verschieben. Mit Mausrad oder +/− zoomen.
        </p>
        <button
          type="button"
          onClick={onUseManual}
          className="mt-2 min-h-11 w-full rounded-lg px-4 py-2 text-sm font-bold text-brand underline decoration-brand/30 underline-offset-4"
        >
          Fläche lieber in m² eingeben
        </button>
      </div>
    </div>
  );
}

export function WinterAreaMapDialog({
  apiKey,
  address,
  location,
  locationNotice,
  initialPoints = [],
  initialPolygons = [],
  showGuide,
  onGuideSeen,
  onClose,
  onUseManual,
  onConfirm,
}: {
  apiKey: string;
  address: string;
  location: WinterMapPoint;
  locationNotice?: string;
  /** @deprecated Übergangsweise unterstützt; künftig `initialPolygons` verwenden. */
  initialPoints?: WinterMapPoint[];
  initialPolygons?: WinterMapPoint[][];
  showGuide: boolean;
  onGuideSeen: () => void;
  onClose: () => void;
  onUseManual: () => void;
  onConfirm: (result: WinterAreaDrawingResult) => void;
}) {
  const [preparedInitialSurfaces] = useState(() => prepareInitialSurfaces(initialPolygons, initialPoints));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRefs = useRef<google.maps.Polygon[]>([]);
  const polylineOutlineRef = useRef<google.maps.Polyline | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const overlayListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapsLibraryRef = useRef<google.maps.MapsLibrary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [guideOpen, setGuideOpen] = useState(showGuide);
  const [surfaces, setSurfaces] = useState<SurfaceDraft[]>(preparedInitialSurfaces);
  const [activeSurfaceId, setActiveSurfaceId] = useState(preparedInitialSurfaces.at(-1)?.id ?? 1);
  const [mapMessage, setMapMessage] = useState("");
  const nextSurfaceIdRef = useRef(preparedInitialSurfaces.length + 1);
  const guideOpenRef = useRef(guideOpen);
  const surfacesRef = useRef(surfaces);
  const activeSurfaceIdRef = useRef(activeSurfaceId);

  const { summaries, overlapPairs } = useMemo(() => {
    const surfaceSummaries = surfaces.map((surface) => {
      const simple = surface.points.length >= 3 && isSimpleWinterPolygon(surface.points);
      const area = simple ? calculateWinterPolygonArea(surface.points) : 0;
      return { ...surface, simple, area };
    });
    const detectedOverlaps = findWinterMapPolygonOverlaps(
      surfaceSummaries.map((surface) => surface.points),
    );
    const overlappingIndexes = new Set(
      detectedOverlaps.flatMap(({ firstIndex, secondIndex }) => [firstIndex, secondIndex]),
    );

    return {
      summaries: surfaceSummaries.map(
        (surface, index): SurfaceSummary => ({
          ...surface,
          overlaps: overlappingIndexes.has(index),
          valid: surface.closed && surface.simple && surface.area > 0 && !overlappingIndexes.has(index),
        }),
      ),
      overlapPairs: detectedOverlaps,
    };
  }, [surfaces]);
  const activeSummary = summaries.find((surface) => surface.id === activeSurfaceId) ?? summaries[0];
  const firstOverlap = overlapPairs[0];
  const hasOverlappingSurface = overlapPairs.length > 0;
  const allSurfacesComplete = summaries.length > 0 && summaries.every((surface) => surface.valid);
  const totalPreviewArea = hasOverlappingSurface
    ? 0
    : summaries.reduce((total, surface) => total + surface.area, 0);
  const totalPointCount = summaries.reduce((total, surface) => total + surface.points.length, 0);
  const hasOpenSurface = summaries.some((surface) => !surface.closed);
  const hasInvalidSurface = summaries.some(
    (surface) => surface.points.length >= 3 && !surface.simple,
  );

  useEffect(() => {
    guideOpenRef.current = guideOpen;
  }, [guideOpen]);

  useEffect(() => {
    surfacesRef.current = surfaces;
  }, [surfaces]);

  useEffect(() => {
    activeSurfaceIdRef.current = activeSurfaceId;
  }, [activeSurfaceId]);

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
        const [mapsLibrary] = await loadGoogleMapDrawing(apiKey);
        if (!active || !mapHostRef.current) return;

        mapsLibraryRef.current = mapsLibrary;
        const map = new mapsLibrary.Map(mapHostRef.current, {
          center: location,
          zoom: 20,
          mapTypeId: "hybrid",
          mapTypeControl: true,
          mapTypeControlOptions: {
            mapTypeIds: ["roadmap", "hybrid"],
          },
          zoomControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          disableDoubleClickZoom: true,
          draggableCursor: "crosshair",
          gestureHandling: "greedy",
          scrollwheel: true,
        });
        mapRef.current = map;

        mapClickListenerRef.current = map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (guideOpenRef.current || !event.latLng) return;

          const currentSurfaces = surfacesRef.current;
          const currentSurface = currentSurfaces.find((surface) => surface.id === activeSurfaceIdRef.current);
          if (!currentSurface || currentSurface.closed) return;

          const totalPoints = currentSurfaces.reduce((total, surface) => total + surface.points.length, 0);
          if (
            currentSurface.points.length >= winterMapConfig.maximumPoints ||
            totalPoints >= winterMapConfig.maximumTotalPoints
          ) {
            setMapMessage("Die maximale Anzahl an Eckpunkten ist erreicht. Bitte schließen Sie die Teilfläche.");
            return;
          }

          const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          setSurfaces((current) =>
            current.map((surface) =>
              surface.id === activeSurfaceIdRef.current
                ? { ...surface, points: [...surface.points, point] }
                : surface,
            ),
          );
          setMapMessage("");
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
      overlayListenersRef.current.forEach((listener) => listener.remove());
      polygonRefs.current.forEach((polygon) => polygon.setMap(null));
      circlesRef.current.forEach((circle) => circle.setMap(null));
      polylineOutlineRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
    };
  }, [apiKey, location]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsLibrary = mapsLibraryRef.current;
    if (!map || !mapsLibrary || status !== "ready") return;

    overlayListenersRef.current.forEach((listener) => listener.remove());
    polygonRefs.current.forEach((polygon) => polygon.setMap(null));
    circlesRef.current.forEach((circle) => circle.setMap(null));
    polylineOutlineRef.current?.setMap(null);
    polylineRef.current?.setMap(null);
    overlayListenersRef.current = [];
    polygonRefs.current = [];
    circlesRef.current = [];
    polylineOutlineRef.current = null;
    polylineRef.current = null;

    summaries.forEach((surface, index) => {
      if (surface.points.length < 3) return;
      const active = surface.id === activeSurfaceId;
      const color = surface.simple && !surface.overlaps ? surfacePalette[index % surfacePalette.length] : "#dc2626";
      const outline = new mapsLibrary.Polygon({
        map,
        paths: surface.points,
        strokeColor: "#082b61",
        strokeOpacity: 1,
        strokeWeight: active ? 11 : 8,
        fillOpacity: 0,
        clickable: false,
        zIndex: active ? 3 : 1,
      });
      const polygon = new mapsLibrary.Polygon({
        map,
        paths: surface.points,
        strokeColor: surface.simple && !surface.overlaps && active ? "#f5c542" : color,
        strokeOpacity: 1,
        strokeWeight: active ? 6 : 4,
        fillColor: color,
        fillOpacity: surface.closed ? 0.46 : 0.28,
        clickable: true,
        zIndex: active ? 4 : 2,
      });
      polygonRefs.current.push(outline, polygon);
      overlayListenersRef.current.push(
        polygon.addListener("click", (event: google.maps.PolyMouseEvent) => {
          event.stop();
          setActiveSurfaceId(surface.id);
          setMapMessage("");
        }),
      );
    });

    if (activeSummary && !activeSummary.closed && activeSummary.points.length > 0) {
      polylineOutlineRef.current = new mapsLibrary.Polyline({
        map,
        path: activeSummary.points,
        strokeColor: "#082b61",
        strokeOpacity: 1,
        strokeWeight: 11,
        clickable: false,
        zIndex: 5,
      });
      polylineRef.current = new mapsLibrary.Polyline({
        map,
        path: activeSummary.points,
        strokeColor:
          (activeSummary.simple && !activeSummary.overlaps) || activeSummary.points.length < 3
            ? "#f5c542"
            : "#dc2626",
        strokeOpacity: 1,
        strokeWeight: 6,
        clickable: false,
        zIndex: 6,
      });
    }

    if (activeSummary) {
      circlesRef.current = activeSummary.points.map((point, index) => {
        const isStartPoint = index === 0;
        const circle = new mapsLibrary.Circle({
          map,
          center: point,
          radius: isStartPoint ? 2.35 : 1.35,
          fillColor: isStartPoint ? "#f5c542" : "#082b61",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeOpacity: 1,
          strokeWeight: isStartPoint ? 4 : 3,
          clickable: true,
          draggable: true,
          zIndex: isStartPoint ? 12 : 10,
        });

        overlayListenersRef.current.push(
          circle.addListener("dragend", () => {
            const center = circle.getCenter();
            if (!center) return;
            setSurfaces((current) =>
              current.map((surface) =>
                surface.id === activeSummary.id
                  ? {
                      ...surface,
                      points: surface.points.map((currentPoint, currentIndex) =>
                        currentIndex === index ? { lat: center.lat(), lng: center.lng() } : currentPoint,
                      ),
                    }
                  : surface,
              ),
            );
            setMapMessage("");
          }),
        );

        if (isStartPoint) {
          overlayListenersRef.current.push(
            circle.addListener("click", (event: google.maps.MapMouseEvent) => {
              event.stop();
              closeSurface(activeSummary.id);
            }),
          );
        }

        return circle;
      });
    }

    return () => {
      overlayListenersRef.current.forEach((listener) => listener.remove());
      polygonRefs.current.forEach((polygon) => polygon.setMap(null));
      circlesRef.current.forEach((circle) => circle.setMap(null));
      polylineOutlineRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
    };
  }, [activeSummary, activeSurfaceId, status, summaries]);

  function closeSurface(surfaceId: number) {
    const surface = surfacesRef.current.find((candidate) => candidate.id === surfaceId);
    if (!surface || surface.closed) return;
    if (surface.points.length < 3) {
      setMapMessage("Setzen Sie mindestens drei Eckpunkte, bevor Sie die Teilfläche schließen.");
      return;
    }
    if (!isSimpleWinterPolygon(surface.points)) {
      setMapMessage("Diese Teilfläche ist ungültig: Linien kreuzen sich oder Punkte liegen doppelt. Bitte korrigieren.");
      return;
    }

    const currentSurfaces = surfacesRef.current;
    const currentSurfaceIndex = currentSurfaces.findIndex((candidate) => candidate.id === surfaceId);
    const overlap = findWinterMapPolygonOverlaps(currentSurfaces.map((candidate) => candidate.points)).find(
      ({ firstIndex, secondIndex }) => firstIndex === currentSurfaceIndex || secondIndex === currentSurfaceIndex,
    );
    if (overlap) {
      const otherIndex = overlap.firstIndex === currentSurfaceIndex ? overlap.secondIndex : overlap.firstIndex;
      setMapMessage(
        `Diese Teilfläche überschneidet oder berührt Fläche ${otherIndex + 1}. Bitte verschieben oder löschen Sie Eckpunkte.`,
      );
      return;
    }

    setSurfaces((current) =>
      current.map((candidate) => (candidate.id === surfaceId ? { ...candidate, closed: true } : candidate)),
    );
    setMapMessage("");
  }

  function startDrawing() {
    setGuideOpen(false);
    onGuideSeen();
  }

  function undoPoint() {
    if (!activeSummary?.points.length) return;
    setSurfaces((current) =>
      current.map((surface) =>
        surface.id === activeSummary.id
          ? { ...surface, closed: false, points: surface.points.slice(0, -1) }
          : surface,
      ),
    );
    setMapMessage("");
  }

  function removeActiveSurface() {
    if (!activeSummary) return;
    if (surfaces.length === 1) {
      setSurfaces([{ ...surfaces[0], points: [], closed: false }]);
      setMapMessage("");
      return;
    }

    const activeIndex = surfaces.findIndex((surface) => surface.id === activeSummary.id);
    const next = surfaces.filter((surface) => surface.id !== activeSummary.id);
    const nextActive = next[Math.min(Math.max(activeIndex - 1, 0), next.length - 1)];
    setSurfaces(next);
    setActiveSurfaceId(nextActive.id);
    setMapMessage("");
  }

  function addSurface() {
    if (!allSurfacesComplete || surfaces.length >= winterMapConfig.maximumPolygons) return;
    const id = nextSurfaceIdRef.current;
    nextSurfaceIdRef.current += 1;
    setSurfaces((current) => [...current, { id, points: [], closed: false }]);
    setActiveSurfaceId(id);
    setMapMessage("Neue Teilfläche: Setzen Sie den ersten Eckpunkt.");
  }

  function changeZoom(delta: number) {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom() ?? 20;
    map.setZoom(Math.max(3, Math.min(22, zoom + delta)));
  }

  function confirmArea() {
    if (!allSurfacesComplete) return;
    const polygons = summaries.map((surface) => sanitizeWinterMapPoints(surface.points));
    const overlaps = findWinterMapPolygonOverlaps(polygons);
    if (overlaps.length) {
      const { firstIndex, secondIndex } = overlaps[0];
      setActiveSurfaceId(summaries[secondIndex]?.id ?? summaries[firstIndex]?.id ?? activeSurfaceId);
      setMapMessage(
        `Fläche ${firstIndex + 1} und Fläche ${secondIndex + 1} überschneiden oder berühren sich. Bitte korrigieren Sie die Markierung.`,
      );
      return;
    }
    const rawAreas = summaries.map((surface) => surface.area);
    const totalArea = rawAreas.reduce((total, area) => total + area, 0);
    const snapshotDataUrl = createSchematicSnapshotDataUrl(polygons, address, totalArea);

    onConfirm({
      area: Math.round(totalArea),
      points: polygons[0] ?? [],
      polygons,
      polygonAreas: rawAreas.map((area) => Math.round(area)),
      ...(snapshotDataUrl ? { snapshotDataUrl, snapshotKind: "schematic-jpeg" as const } : {}),
    });
  }

  const statusMessage = mapMessage
    ? mapMessage
    : firstOverlap
      ? `Fläche ${firstOverlap.firstIndex + 1} und Fläche ${firstOverlap.secondIndex + 1} überschneiden oder berühren sich. Bitte verschieben oder löschen Sie Eckpunkte.`
    : hasInvalidSurface
      ? "Eine Teilfläche ist ungültig. Wählen Sie sie unten aus und korrigieren Sie die Eckpunkte."
      : activeSummary?.closed
        ? "Teilfläche abgeschlossen – Eckpunkte können weiterhin verschoben werden."
        : activeSummary && activeSummary.points.length >= 3
          ? "Gelben Startpunkt wählen oder unten auf „Teilfläche schließen“ klicken."
          : "Nacheinander die äußeren Ecken der aktuellen Teilfläche setzen.";

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
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Schritt 2 · Flächen markieren</p>
            <h2 id="winter-map-title" className="mt-1 text-xl font-extrabold text-slate-950 sm:text-2xl">
              Winterdienstflächen einzeichnen
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

        {locationNotice ? (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-950 sm:px-6" role="status">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />
            <p>{locationNotice}</p>
          </div>
        ) : null}

        <div className="relative min-h-[42svh] flex-1 bg-slate-200 sm:min-h-[34rem]">
          <div ref={mapHostRef} className="absolute inset-0" aria-label="Google-Karte zum Markieren der Winterdienstflächen" />

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

          {status === "ready" && guideOpen ? (
            <DrawingGuide onUnderstood={startDrawing} onUseManual={onUseManual} />
          ) : null}

          {status === "ready" && !guideOpen ? (
            <>
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
                <p className={`max-w-2xl rounded-xl px-4 py-2 text-center text-xs font-bold text-white shadow-lg backdrop-blur sm:text-sm ${hasInvalidSurface || hasOverlappingSurface || mapMessage.includes("ungültig") || mapMessage.includes("überschneidet") ? "bg-red-700/95" : "bg-brand-dark/92"}`} role={hasInvalidSurface || hasOverlappingSurface ? "alert" : "status"}>
                  {statusMessage}
                </p>
              </div>

              <div className="absolute right-3 top-16 z-10 grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <button
                  type="button"
                  onClick={() => changeZoom(1)}
                  className="grid h-11 w-11 place-items-center text-brand transition hover:bg-brand-soft"
                  aria-label="Karte vergrößern"
                >
                  <Plus aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => changeZoom(-1)}
                  className="grid h-11 w-11 place-items-center border-t border-slate-200 text-brand transition hover:bg-brand-soft"
                  aria-label="Karte verkleinern"
                >
                  <Minus aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>

              <div className="absolute bottom-3 left-3 right-3 z-10 rounded-xl bg-white/96 p-3 shadow-xl backdrop-blur sm:left-auto sm:min-w-[27rem] sm:max-w-xl">
                <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Markierte Teilflächen">
                  {summaries.map((surface, index) => (
                    <button
                      key={surface.id}
                      type="button"
                      onClick={() => {
                        setActiveSurfaceId(surface.id);
                        setMapMessage("");
                      }}
                      className={`flex min-h-9 flex-none items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-extrabold transition ${surface.id === activeSurfaceId ? "border-brand bg-brand-soft text-brand" : "border-slate-200 bg-white text-slate-650 hover:border-brand/40"}`}
                      aria-pressed={surface.id === activeSurfaceId}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: surface.simple && !surface.overlaps ? surfacePalette[index % surfacePalette.length] : "#dc2626" }} />
                      Fläche {index + 1} · {surface.overlaps ? "Überschneidung" : surface.area > 0 ? `${Math.round(surface.area).toLocaleString("de-DE")} m²` : `${surface.points.length} Punkte`}
                    </button>
                  ))}
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-2">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                      {hasOpenSurface ? "Gesamtvorschau" : "Gesamtfläche"} · {summaries.length} {summaries.length === 1 ? "Fläche" : "Teilflächen"}
                    </p>
                    <p className={`mt-0.5 text-2xl font-extrabold ${hasInvalidSurface || hasOverlappingSurface ? "text-red-700" : "text-brand"}`} aria-live="polite">
                      {hasInvalidSurface || hasOverlappingSurface ? "Bitte korrigieren" : `${Math.round(totalPreviewArea).toLocaleString("de-DE")} m²`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={undoPoint}
                      disabled={!activeSummary?.points.length}
                      className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                      aria-label="Letzten Punkt der aktuellen Teilfläche entfernen"
                    >
                      <Undo2 aria-hidden="true" className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={removeActiveSurface}
                      disabled={!activeSummary}
                      className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 bg-white text-red-700 disabled:opacity-40"
                      aria-label="Aktuelle Teilfläche löschen"
                    >
                      <Trash2 aria-hidden="true" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {status === "ready" && !guideOpen ? (
          <footer className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-slate-650 transition hover:bg-slate-50"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" /> Anleitung zeigen
              </button>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
                {!activeSummary?.closed && activeSummary && activeSummary.points.length >= 3 ? (
                  <button
                    type="button"
                    onClick={() => closeSurface(activeSummary.id)}
                    disabled={!activeSummary.simple || activeSummary.overlaps}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand px-5 py-3 text-sm font-extrabold text-brand disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                  >
                    Teilfläche schließen <CornerDownLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
                {allSurfacesComplete &&
                surfaces.length < winterMapConfig.maximumPolygons &&
                totalPointCount < winterMapConfig.maximumTotalPoints ? (
                  <button
                    type="button"
                    onClick={addSurface}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand px-5 py-3 text-sm font-extrabold text-brand transition hover:bg-brand-soft"
                  >
                    Weitere Fläche hinzufügen <PlusCircle aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={confirmArea}
                  disabled={!allSurfacesComplete}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-extrabold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Layers3 aria-hidden="true" className="h-4 w-4" />
                  {allSurfacesComplete
                    ? `${Math.round(totalPreviewArea).toLocaleString("de-DE")} m² übernehmen`
                    : "Alle Teilflächen abschließen"}
                </button>
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
