export type WinterMapPoint = {
  lat: number;
  lng: number;
};

export type WinterMapPolygon = WinterMapPoint[];

export type WinterMapPolygonOverlap = {
  firstIndex: number;
  secondIndex: number;
};

export const winterMapConfig = {
  maximumPoints: 40,
  maximumPolygons: 12,
  maximumTotalPoints: 160,
  maximumAddressLength: 300,
  earthRadiusMeters: 6_378_137,
} as const;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function polarTriangleArea(tanLat1: number, lng1: number, tanLat2: number, lng2: number) {
  const deltaLng = lng1 - lng2;
  const tangentProduct = tanLat1 * tanLat2;

  return 2 * Math.atan2(
    tangentProduct * Math.sin(deltaLng),
    1 + tangentProduct * Math.cos(deltaLng),
  );
}

function orientation(a: WinterMapPoint, b: WinterMapPoint, c: WinterMapPoint) {
  const crossProduct = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  if (Math.abs(crossProduct) < 1e-14) return 0;
  return crossProduct > 0 ? 1 : -1;
}

function pointIsOnSegment(a: WinterMapPoint, b: WinterMapPoint, point: WinterMapPoint) {
  return (
    point.lng >= Math.min(a.lng, b.lng) &&
    point.lng <= Math.max(a.lng, b.lng) &&
    point.lat >= Math.min(a.lat, b.lat) &&
    point.lat <= Math.max(a.lat, b.lat)
  );
}

function segmentsIntersect(a: WinterMapPoint, b: WinterMapPoint, c: WinterMapPoint, d: WinterMapPoint) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (abC !== abD && cdA !== cdB) return true;
  if (abC === 0 && pointIsOnSegment(a, b, c)) return true;
  if (abD === 0 && pointIsOnSegment(a, b, d)) return true;
  if (cdA === 0 && pointIsOnSegment(c, d, a)) return true;
  if (cdB === 0 && pointIsOnSegment(c, d, b)) return true;
  return false;
}

function pointIsInsidePolygon(point: WinterMapPoint, polygon: WinterMapPoint[]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crossesLatitude = currentPoint.lat > point.lat !== previousPoint.lat > point.lat;
    const intersectionLongitude =
      ((previousPoint.lng - currentPoint.lng) * (point.lat - currentPoint.lat)) /
        (previousPoint.lat - currentPoint.lat) +
      currentPoint.lng;

    if (crossesLatitude && point.lng < intersectionLongitude) inside = !inside;
  }

  return inside;
}

export function sanitizeWinterMapPoints(value: unknown): WinterMapPoint[] {
  if (!Array.isArray(value) || value.length > winterMapConfig.maximumPoints) return [];

  const points: WinterMapPoint[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];

    const point = item as Record<string, unknown>;
    const lat = typeof point.lat === "number" ? point.lat : Number.NaN;
    const lng = typeof point.lng === "number" ? point.lng : Number.NaN;

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return [];
    }

    points.push({
      lat: Math.round(lat * 100_000_000) / 100_000_000,
      lng: Math.round(lng * 100_000_000) / 100_000_000,
    });
  }

  return points;
}

export function sanitizeWinterMapPolygons(value: unknown): WinterMapPolygon[] {
  if (!Array.isArray(value) || value.length > winterMapConfig.maximumPolygons) return [];

  const polygons: WinterMapPolygon[] = [];
  let totalPoints = 0;

  for (const valuePolygon of value) {
    const points = sanitizeWinterMapPoints(valuePolygon);
    if (points.length < 3) return [];

    totalPoints += points.length;
    if (totalPoints > winterMapConfig.maximumTotalPoints) return [];
    polygons.push(points);
  }

  return polygons;
}

export function sanitizeWinterObjectAddress(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, winterMapConfig.maximumAddressLength);
}

/**
 * Berechnet die geodätische Polygonfläche auf derselben Erdkugel, die auch
 * Google Maps standardmäßig verwendet. Für ungültige oder zu kurze Pfade wird
 * bewusst 0 zurückgegeben, damit die API keine Client-Fläche übernehmen muss.
 */
export function calculateWinterPolygonArea(value: unknown) {
  const points = sanitizeWinterMapPoints(value);
  if (points.length < 3) return 0;

  let total = 0;
  const lastPoint = points[points.length - 1];
  let previousTanLat = Math.tan((Math.PI / 2 - toRadians(lastPoint.lat)) / 2);
  let previousLng = toRadians(lastPoint.lng);

  for (const point of points) {
    const tanLat = Math.tan((Math.PI / 2 - toRadians(point.lat)) / 2);
    const lng = toRadians(point.lng);
    total += polarTriangleArea(tanLat, lng, previousTanLat, previousLng);
    previousTanLat = tanLat;
    previousLng = lng;
  }

  return Math.abs(total * winterMapConfig.earthRadiusMeters * winterMapConfig.earthRadiusMeters);
}

export function isSimpleWinterPolygon(value: unknown) {
  const points = sanitizeWinterMapPoints(value);
  if (points.length < 3) return false;

  for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
    const edgeStart = points[edgeIndex];
    const edgeEnd = points[(edgeIndex + 1) % points.length];
    if (edgeStart.lat === edgeEnd.lat && edgeStart.lng === edgeEnd.lng) return false;

    for (let comparisonIndex = edgeIndex + 1; comparisonIndex < points.length; comparisonIndex += 1) {
      const edgesAreAdjacent =
        comparisonIndex === edgeIndex + 1 || (edgeIndex === 0 && comparisonIndex === points.length - 1);
      if (edgesAreAdjacent) continue;

      const comparisonStart = points[comparisonIndex];
      const comparisonEnd = points[(comparisonIndex + 1) % points.length];
      if (segmentsIntersect(edgeStart, edgeEnd, comparisonStart, comparisonEnd)) return false;
    }
  }

  return calculateWinterPolygonArea(points) > 0;
}

/**
 * Verwendet dieselben Regeln wie die serverseitige Annahme: Teilflächen dürfen
 * weder Kanten kreuzen/berühren noch ganz oder teilweise ineinander liegen.
 * Identische Polygone werden dadurch ebenfalls als Überschneidung erkannt.
 */
export function winterMapPolygonsOverlap(firstValue: unknown, secondValue: unknown) {
  const first = sanitizeWinterMapPoints(firstValue);
  const second = sanitizeWinterMapPoints(secondValue);
  if (!isSimpleWinterPolygon(first) || !isSimpleWinterPolygon(second)) return false;

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];

    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % second.length];
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }

  return pointIsInsidePolygon(first[0], second) || pointIsInsidePolygon(second[0], first);
}

export function findWinterMapPolygonOverlaps(value: unknown): WinterMapPolygonOverlap[] {
  if (!Array.isArray(value) || value.length > winterMapConfig.maximumPolygons) return [];

  const polygons = value.map((polygon) => sanitizeWinterMapPoints(polygon));
  const overlaps: WinterMapPolygonOverlap[] = [];

  for (let firstIndex = 0; firstIndex < polygons.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < polygons.length; secondIndex += 1) {
      if (winterMapPolygonsOverlap(polygons[firstIndex], polygons[secondIndex])) {
        overlaps.push({ firstIndex, secondIndex });
      }
    }
  }

  return overlaps;
}

export function areValidWinterMapPolygons(value: unknown) {
  const polygons = sanitizeWinterMapPolygons(value);
  return (
    polygons.length > 0 &&
    polygons.every((polygon) => isSimpleWinterPolygon(polygon)) &&
    findWinterMapPolygonOverlaps(polygons).length === 0
  );
}

export function calculateWinterPolygonsArea(value: unknown) {
  const polygons = sanitizeWinterMapPolygons(value);
  if (
    !polygons.length ||
    polygons.some((polygon) => !isSimpleWinterPolygon(polygon)) ||
    findWinterMapPolygonOverlaps(polygons).length > 0
  ) {
    return 0;
  }

  return polygons.reduce((total, polygon) => total + calculateWinterPolygonArea(polygon), 0);
}
