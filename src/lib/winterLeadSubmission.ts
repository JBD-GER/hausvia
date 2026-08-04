export type WinterMapPoint = {
  lat: number;
  lng: number;
};

const maximumPointsPerPolygon = 40;
const earthRadiusMeters = 6_378_137;

export const winterLeadSubmissionConfig = {
  maximumPolygons: 12,
  maximumTotalPoints: 160,
} as const;

export type WinterPolygonsResult =
  | { status: "absent"; polygons: []; totalArea: 0 }
  | { status: "invalid"; polygons: []; totalArea: 0 }
  | { status: "valid"; polygons: WinterMapPoint[][]; totalArea: number };

function pointsAreEqual(first: WinterMapPoint, second: WinterMapPoint) {
  return first.lat === second.lat && first.lng === second.lng;
}

function sanitizeWinterMapPoints(value: unknown) {
  if (!Array.isArray(value) || value.length > maximumPointsPerPolygon) return [];

  const points: WinterMapPoint[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const point = item as Record<string, unknown>;
    if (
      typeof point.lat !== "number" ||
      typeof point.lng !== "number" ||
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng) ||
      point.lat < -90 ||
      point.lat > 90 ||
      point.lng < -180 ||
      point.lng > 180
    ) {
      return [];
    }
    points.push({
      lat: Math.round(point.lat * 100_000_000) / 100_000_000,
      lng: Math.round(point.lng * 100_000_000) / 100_000_000,
    });
  }
  return points;
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

function calculateWinterPolygonArea(points: WinterMapPoint[]) {
  if (points.length < 3) return 0;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const polarTriangleArea = (tanLat1: number, lng1: number, tanLat2: number, lng2: number) => {
    const deltaLng = lng1 - lng2;
    const tangentProduct = tanLat1 * tanLat2;
    return 2 * Math.atan2(tangentProduct * Math.sin(deltaLng), 1 + tangentProduct * Math.cos(deltaLng));
  };

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
  return Math.abs(total * earthRadiusMeters * earthRadiusMeters);
}

function isSimpleWinterPolygon(points: WinterMapPoint[]) {
  if (points.length < 3) return false;
  for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
    const edgeStart = points[edgeIndex];
    const edgeEnd = points[(edgeIndex + 1) % points.length];
    if (pointsAreEqual(edgeStart, edgeEnd)) return false;
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

function polygonsOverlap(first: WinterMapPoint[], second: WinterMapPoint[]) {
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

function normalizePolygon(value: unknown) {
  const sanitized = sanitizeWinterMapPoints(value);
  if (sanitized.length >= 2 && pointsAreEqual(sanitized[0], sanitized[sanitized.length - 1])) {
    return sanitized.slice(0, -1);
  }
  return sanitized;
}

/**
 * Accepts the current multi-polygon format and the former single-polygon field.
 * Returning an explicit status lets callers distinguish a manual entry from a
 * malformed map payload instead of silently trusting a submitted square-meter value.
 */
export function parseWinterPolygons(value: unknown, legacyValue?: unknown): WinterPolygonsResult {
  const hasCurrentValue = value !== undefined && value !== null;
  const hasLegacyValue = legacyValue !== undefined && legacyValue !== null;
  if (!hasCurrentValue && !hasLegacyValue) return { status: "absent", polygons: [], totalArea: 0 };

  const rawPolygons = hasCurrentValue ? value : [legacyValue];
  if (
    !Array.isArray(rawPolygons) ||
    rawPolygons.length === 0 ||
    rawPolygons.length > winterLeadSubmissionConfig.maximumPolygons
  ) {
    return { status: "invalid", polygons: [], totalArea: 0 };
  }

  const polygons: WinterMapPoint[][] = [];
  let totalPoints = 0;
  let totalArea = 0;

  for (const rawPolygon of rawPolygons) {
    const polygon = normalizePolygon(rawPolygon);
    totalPoints += polygon.length;
    if (
      polygon.length < 3 ||
      totalPoints > winterLeadSubmissionConfig.maximumTotalPoints ||
      !isSimpleWinterPolygon(polygon)
    ) {
      return { status: "invalid", polygons: [], totalArea: 0 };
    }

    const area = calculateWinterPolygonArea(polygon);
    if (!Number.isFinite(area) || area <= 0) {
      return { status: "invalid", polygons: [], totalArea: 0 };
    }

    if (polygons.some((existingPolygon) => polygonsOverlap(existingPolygon, polygon))) {
      return { status: "invalid", polygons: [], totalArea: 0 };
    }

    polygons.push(polygon);
    totalArea += area;
  }

  if (!Number.isFinite(totalArea) || totalArea <= 0) {
    return { status: "invalid", polygons: [], totalArea: 0 };
  }

  return { status: "valid", polygons, totalArea: Math.round(totalArea) };
}
