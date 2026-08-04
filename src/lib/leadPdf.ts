import { SITE } from "@/lib/site";
import { parseWinterPolygons, type WinterMapPoint } from "@/lib/winterLeadSubmission";
import { winterPricingConfig } from "@/lib/winterPricing";

type LeadRecord = Record<string, unknown>;

type LeadPdfInput = {
  source: string;
  submittedAt: string;
  lead: LeadRecord;
};

type WinterPdfEstimate = {
  monthlyBaseGross: number;
  seasonBaseGross: number;
  deploymentGross: number;
  seasonMonths: number;
  contractPeriod: string;
  vatRate: number;
  readiness: string;
  readinessSurchargePercent: number;
  pricingOptions: {
    flex: {
      monthlyBaseGross: number;
      seasonBaseGross: number;
      deploymentGross: number;
    };
    plan: {
      includedDeployments: number;
      deploymentDiscountPercent: number;
      discountedDeploymentGross: number;
      monthlyGross: number;
      seasonGross: number;
      additionalDeploymentGross: number;
    };
  };
};

const pageWidth = 595;
const pageHeight = 842;
const margin = 46;
const brand = { r: 0.031, g: 0.169, b: 0.38 };
const slate = { r: 0.094, g: 0.126, b: 0.2 };
const muted = { r: 0.31, g: 0.36, b: 0.43 };
const yellow = { r: 0.96, g: 0.77, b: 0.26 };
const softYellow = { r: 1, g: 0.96, b: 0.84 };
const softBlue = { r: 0.91, g: 0.95, b: 0.99 };
const softSlate = { r: 0.97, g: 0.98, b: 0.99 };
const softGreen = { r: 0.9, g: 0.97, b: 0.93 };
const softAmber = { r: 1, g: 0.91, b: 0.72 };
const white = { r: 1, g: 1, b: 1 };

function winAnsiByte(char: string) {
  const code = char.charCodeAt(0);
  const special: Record<string, number> = {
    "€": 0x80,
    "„": 0x84,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "–": 0x96,
    "—": 0x97,
    "’": 0x92,
  };

  if (special[char] !== undefined) return special[char];
  if (code >= 32 && code <= 255) return code;
  return 45;
}

function textHex(value: string) {
  return Array.from(value)
    .map((char) => winAnsiByte(char).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function escapePdfText(value: string) {
  return `<${textHex(value)}>`;
}

function colorCommand(color: { r: number; g: number; b: number }, type: "fill" | "stroke" = "fill") {
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} ${type === "fill" ? "rg" : "RG"}`;
}

function rect(x: number, y: number, width: number, height: number, color: typeof brand) {
  return `q ${colorCommand(color)} ${x} ${y} ${width} ${height} re f Q`;
}

function line(x1: number, y1: number, x2: number, y2: number, color: typeof brand, width = 1) {
  return `q ${colorCommand(color, "stroke")} ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function text(value: string, x: number, y: number, size: number, color = slate, font = "F1") {
  return `BT /${font} ${size} Tf ${colorCommand(color)} 1 0 0 1 ${x} ${y} Tm ${escapePdfText(value)} Tj ET`;
}

function valueAsString(value: unknown, fallback = "-") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("de-DE");
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return fallback;
}

function valueAsNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function valueAsStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => valueAsString(item, "")).filter(Boolean);
}

function valueAsRecord(value: unknown): LeadRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as LeadRecord) : null;
}

function formatPolygonPoints(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((item, index) => {
      const point = valueAsRecord(item);
      if (!point) return "";
      const lat = valueAsNumber(point.lat);
      const lng = valueAsNumber(point.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
      return `${index + 1}: ${lat.toFixed(8)}, ${lng.toFixed(8)}`;
    })
    .filter(Boolean)
    .join(" | ");
}

function formatPolygonGroups(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((polygon, index) => {
      if (!Array.isArray(polygon) || polygon.length < 3) return "";
      return `Teilfläche ${index + 1}: ${polygon.length} Eckpunkte`;
    })
    .filter(Boolean);
}

function formatEuro(value: number) {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("de-DE");
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEstimateText(lead: LeadRecord) {
  if (typeof lead.estimateText === "string" && lead.estimateText.trim()) return lead.estimateText.trim();

  const estimate = lead.estimate;
  if (!estimate || typeof estimate !== "object") return "";
  const lower = valueAsNumber((estimate as LeadRecord).lower);
  const upper = valueAsNumber((estimate as LeadRecord).upper);
  if (!lower || !upper) return "";
  const billingPeriodLabel =
    estimate && typeof estimate === "object" && "billingPeriodLabel" in estimate
      ? valueAsString((estimate as Record<string, unknown>).billingPeriodLabel, "pro Monat")
      : "pro Monat";

  return `${formatEuro(lower)} bis ${formatEuro(upper)} ${billingPeriodLabel}`;
}

function getWinterEstimate(lead: LeadRecord): WinterPdfEstimate | null {
  const estimate = valueAsRecord(lead.estimate);
  if (!estimate || estimate.pricingModel !== "winter-season-plus-deployment") return null;

  const monthlyBaseGross = valueAsNumber(estimate.monthlyBaseGross);
  const seasonBaseGross = valueAsNumber(estimate.seasonBaseGross);
  const deploymentGross = valueAsNumber(estimate.deploymentGross);
  if (!monthlyBaseGross || !seasonBaseGross || !deploymentGross) return null;

  const seasonMonths = valueAsNumber(estimate.seasonMonths) || 5;
  const pricingOptions = valueAsRecord(estimate.pricingOptions);
  const submittedFlex = valueAsRecord(pricingOptions?.flex);
  const submittedPlan = valueAsRecord(pricingOptions?.plan);
  const flexMonthlyBaseGross = valueAsNumber(submittedFlex?.monthlyBaseGross) || monthlyBaseGross;
  const flexSeasonBaseGross = valueAsNumber(submittedFlex?.seasonBaseGross) || seasonBaseGross;
  const flexDeploymentGross = valueAsNumber(submittedFlex?.deploymentGross) || deploymentGross;
  const includedDeployments = valueAsNumber(submittedPlan?.includedDeployments) || 10;
  const deploymentDiscountPercent = valueAsNumber(submittedPlan?.deploymentDiscountPercent) || 10;
  const discountedDeploymentGross =
    valueAsNumber(submittedPlan?.discountedDeploymentGross) ||
    Math.round(flexDeploymentGross * (1 - deploymentDiscountPercent / 100) * 100) / 100;
  const fallbackPlanSeasonGross = flexSeasonBaseGross + discountedDeploymentGross * includedDeployments;
  const planSeasonGross = valueAsNumber(submittedPlan?.seasonGross) || fallbackPlanSeasonGross;
  const planMonthlyGross = valueAsNumber(submittedPlan?.monthlyGross) || planSeasonGross / seasonMonths;
  const additionalDeploymentGross =
    valueAsNumber(submittedPlan?.additionalDeploymentGross) || discountedDeploymentGross;

  return {
    monthlyBaseGross,
    seasonBaseGross,
    deploymentGross,
    seasonMonths,
    contractPeriod: valueAsString(estimate.contractPeriod, "1. November bis 31. März"),
    vatRate: valueAsNumber(estimate.vatRate) || 19,
    readiness: valueAsString(estimate.readiness, "standard"),
    readinessSurchargePercent: valueAsNumber(estimate.readinessSurchargePercent),
    pricingOptions: {
      flex: {
        monthlyBaseGross: flexMonthlyBaseGross,
        seasonBaseGross: flexSeasonBaseGross,
        deploymentGross: flexDeploymentGross,
      },
      plan: {
        includedDeployments,
        deploymentDiscountPercent,
        discountedDeploymentGross,
        monthlyGross: planMonthlyGross,
        seasonGross: planSeasonGross,
        additionalDeploymentGross,
      },
    },
  };
}

function wrapText(value: string, maxChars: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let lineValue = "";

  for (const word of words) {
    const next = lineValue ? `${lineValue} ${word}` : word;
    if (next.length > maxChars && lineValue) {
      lines.push(lineValue);
      lineValue = word;
    } else {
      lineValue = next;
    }
  }

  if (lineValue) lines.push(lineValue);
  return lines.length ? lines : ["-"];
}

type ProjectedWinterPoint = {
  x: number;
  y: number;
};

type WinterMapDiagram = {
  polygons: WinterMapPoint[][];
  totalArea: number;
};

function getWinterMapDiagram(lead: LeadRecord): WinterMapDiagram | null {
  if (lead.winterAreaSource !== "map") return null;

  // Defense in depth: only render geometry that passes the same strict server-side
  // validation as the submitted calculator data. Client-created image bytes are
  // intentionally never accepted by the PDF builder.
  const result = parseWinterPolygons(lead.winterPolygons, lead.winterPolygonPoints);
  if (result.status !== "valid") return null;
  return { polygons: result.polygons, totalArea: result.totalArea };
}

function projectWinterPolygons(
  polygons: WinterMapPoint[][],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const allPoints = polygons.flat();
  const meanLatitude = allPoints.reduce((sum, point) => sum + point.lat, 0) / allPoints.length;
  const longitudeScale = Math.max(0.01, Math.cos((meanLatitude * Math.PI) / 180));
  const projected = polygons.map((polygon) =>
    polygon.map((point) => ({ x: point.lng * longitudeScale, y: point.lat })),
  );
  const projectedPoints = projected.flat();
  const minX = Math.min(...projectedPoints.map((point) => point.x));
  const maxX = Math.max(...projectedPoints.map((point) => point.x));
  const minY = Math.min(...projectedPoints.map((point) => point.y));
  const maxY = Math.max(...projectedPoints.map((point) => point.y));
  const spanX = Math.max(maxX - minX, Number.EPSILON);
  const spanY = Math.max(maxY - minY, Number.EPSILON);
  const padding = 28;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return projected.map((polygon) =>
    polygon.map((point): ProjectedWinterPoint => ({
      x: x + width / 2 + (point.x - centerX) * scale,
      y: y + height / 2 + (point.y - centerY) * scale,
    })),
  );
}

function polygonCommand(points: ProjectedWinterPoint[], fill: typeof softBlue) {
  const [first, ...remaining] = points;
  const path = [
    `${first.x.toFixed(2)} ${first.y.toFixed(2)} m`,
    ...remaining.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)} l`),
    "h",
  ].join(" ");
  return `q ${colorCommand(fill)} ${colorCommand(brand, "stroke")} 2.25 w 1 J 1 j ${path} B Q`;
}

function createPdf(pages: string[][]) {
  const objects: string[] = [];
  const firstPageId = 5;
  const pageRefs = pages.map((_, index) => firstPageId + index * 2);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((commands, index) => {
    const pageId = firstPageId + index * 2;
    const contentId = pageId + 1;
    const content = commands.join("\n");
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}

export function createLeadPdf({ source, submittedAt, lead }: LeadPdfInput) {
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;
  let rowIndex = 0;
  const contentWidth = pageWidth - margin * 2;
  const valueX = margin + 190;
  const winterEstimate = getWinterEstimate(lead);
  const winterMapDiagram = getWinterMapDiagram(lead);
  const winterPricingInput = valueAsRecord(lead.winterPricingInput);
  const leadServices = valueAsStringList(lead.selectedServiceLabels).length
    ? valueAsStringList(lead.selectedServiceLabels)
    : valueAsStringList(lead.services);
  const isWinterRequest =
    Boolean(winterEstimate) || (source === "offer-request" && leadServices.includes("Winterdienst"));

  function newPage() {
    commands = [];
    pages.push(commands);
    commands.push(rect(0, 768, pageWidth, 74, brand));
    commands.push(rect(0, 744, pageWidth, 24, yellow));
    commands.push(text("Hausvia", margin, 807, 24, white, "F2"));
    commands.push(text("HAUSMEISTERSERVICE", margin, 787, 8, white, "F2"));
    commands.push(
      text(
        isWinterRequest ? "Winterdienst Preiseinschätzung" : "Kosteneinschätzung für Objektbetreuung",
        margin,
        752,
        10,
        brand,
        "F2",
      ),
    );
    commands.push(text(`Erstellt am ${formatDate(submittedAt)}`, 400, 752, 8, brand));
    commands.push(line(margin, 58, pageWidth - margin, 58, softBlue));
    commands.push(text(`${SITE.name} · ${SITE.email} · ${SITE.phone}`, margin, 38, 8, muted));
    y = 716;
    rowIndex = 0;
  }

  function ensure(space = 32) {
    if (y - space < 78) newPage();
  }

  function addSection(title: string, intro?: string) {
    ensure(intro ? 70 : 50);
    if (y < 700) y -= 8;
    commands.push(text(title, margin, y, 15, brand, "F2"));
    y -= 12;
    commands.push(line(margin, y, pageWidth - margin, y, yellow));
    y -= 18;
    rowIndex = 0;

    if (intro) {
      addParagraph(intro, 9, muted, 84);
      y -= 2;
    }
  }

  function addParagraph(value: string, size = 10, color = slate, maxChars = 92) {
    for (const paragraphLine of wrapText(value, maxChars)) {
      ensure(size + 10);
      commands.push(text(paragraphLine, margin, y, size, color));
      y -= size + 5;
    }
    y -= 4;
  }

  function addRow(label: string, value: string) {
    const labelLines = wrapText(label, 25);
    const valueLines = wrapText(value || "-", 52);
    const lineCount = Math.max(labelLines.length, valueLines.length);
    const rowHeight = Math.max(30, 16 + lineCount * 13);

    ensure(rowHeight + 8);
    const top = y;

    const fill = rowIndex % 2 === 0 ? softSlate : white;
    commands.push(rect(margin, top - rowHeight + 6, contentWidth, rowHeight, fill));

    labelLines.forEach((labelLine, index) => {
      commands.push(text(labelLine, margin + 14, top - 10 - index * 13, 8.5, muted, "F2"));
    });

    valueLines.forEach((valueLine, index) => {
      commands.push(text(valueLine, valueX, top - 10 - index * 13, 9.5, slate));
    });

    y -= rowHeight + 4;
    rowIndex += 1;
  }

  function addEstimateCard(estimateText: string) {
    const cardHeight = 92;
    ensure(cardHeight + 18);
    commands.push(rect(margin, y - cardHeight + 8, contentWidth, cardHeight, softYellow));
    commands.push(rect(margin, y - cardHeight + 8, 5, cardHeight, yellow));
    const estimateLabel =
      lead.estimate && typeof lead.estimate === "object" && "estimateLabel" in lead.estimate
        ? valueAsString((lead.estimate as Record<string, unknown>).estimateLabel, "Unverbindliche Ersteinschätzung")
        : "Unverbindliche Ersteinschätzung";
    commands.push(text(estimateLabel, margin + 20, y - 16, 10, brand, "F2"));
    commands.push(text(`ca. ${estimateText}`, margin + 20, y - 48, 22, slate, "F2"));
    commands.push(text("Unverbindlicher Richtwert. Detailprüfung empfohlen.", margin + 20, y - 72, 9.5, muted));
    y -= cardHeight + 24;
  }

  function addWinterEstimateCard(estimate: WinterPdfEstimate) {
    const cardHeight = 230;
    ensure(cardHeight + 18);
    commands.push(rect(margin, y - cardHeight + 8, contentWidth, cardHeight, softYellow));
    commands.push(rect(margin, y - cardHeight + 8, 5, cardHeight, yellow));
    commands.push(text("ZWEI TARIFVARIANTEN FÜR IHRE WINTERDIENSTFLÄCHE", margin + 20, y - 16, 9, brand, "F2"));

    const columnGap = 12;
    const columnWidth = (contentWidth - 48 - columnGap) / 2;
    const firstColumnX = margin + 18;
    const secondColumnX = firstColumnX + columnWidth + columnGap;
    const columnBottom = y - 174;
    const columnHeight = 140;
    commands.push(rect(firstColumnX, columnBottom, columnWidth, columnHeight, white));
    commands.push(rect(secondColumnX, columnBottom, columnWidth, columnHeight, softBlue));

    const flex = estimate.pricingOptions.flex;
    commands.push(text("VARIABEL · EINSATZGENAU", firstColumnX + 14, y - 53, 9, brand, "F2"));
    commands.push(
      text(
        `${formatEuro(flex.monthlyBaseGross)} / Monat`,
        firstColumnX + 14,
        y - 80,
        16,
        slate,
        "F2",
      ),
    );
    commands.push(text("flächenabhängige Grundgebühr", firstColumnX + 14, y - 99, 8.5, muted));
    commands.push(
      text(
        `+ ${formatEuro(flex.deploymentGross)} je Einsatz`,
        firstColumnX + 14,
        y - 126,
        13,
        brand,
        "F2",
      ),
    );
    commands.push(text("Abrechnung nur bei tatsächlichem Einsatz", firstColumnX + 14, y - 149, 7.8, muted));

    const plan = estimate.pricingOptions.plan;
    commands.push(text("PAUSCHAL · 10ER-SAISONPAKET", secondColumnX + 14, y - 53, 9, brand, "F2"));
    commands.push(
      text(
        `${formatEuro(plan.monthlyGross)} / Monat`,
        secondColumnX + 14,
        y - 80,
        16,
        slate,
        "F2",
      ),
    );
    commands.push(
      text(
        `${plan.includedDeployments} Einsätze · je ${plan.deploymentDiscountPercent} % günstiger`,
        secondColumnX + 14,
        y - 103,
        8.5,
        muted,
      ),
    );
    commands.push(
      text(
        `+ ${formatEuro(plan.additionalDeploymentGross)} je weiterem Einsatz`,
        secondColumnX + 14,
        y - 126,
        11.5,
        brand,
        "F2",
      ),
    );
    commands.push(
      text(
        `${formatEuro(plan.seasonGross)} Saison · Rabatt gilt auch extra`,
        secondColumnX + 14,
        y - 149,
        8.5,
        muted,
      ),
    );

    commands.push(
      text(
        `Vertragslaufzeit ${estimate.contractPeriod} · Preise inkl. ${estimate.vatRate} % USt.`,
        margin + 20,
        y - 202,
        9,
        muted,
      ),
    );
    y -= cardHeight + 24;
  }

  function addInfoCard(title: string, body: string) {
    const bodyLines = wrapText(body, 78);
    const cardHeight = Math.max(78, 42 + bodyLines.length * 13);
    ensure(cardHeight + 14);
    commands.push(rect(margin, y - cardHeight + 8, contentWidth, cardHeight, softBlue));
    commands.push(text(title, margin + 16, y - 16, 12, brand, "F2"));
    bodyLines.forEach((bodyLine, index) => {
      commands.push(text(bodyLine, margin + 16, y - 38 - index * 13, 9.5, slate));
    });
    y -= cardHeight + 14;
  }

  function addWinterMapDiagram(diagram: WinterMapDiagram) {
    const diagramHeight = 242;
    ensure(diagramHeight + 22);
    const diagramBottom = y - diagramHeight;
    const plotX = margin + 16;
    const plotY = diagramBottom + 48;
    const plotWidth = contentWidth - 32;
    const plotHeight = diagramHeight - 64;
    commands.push(rect(margin, diagramBottom, contentWidth, diagramHeight, softSlate));
    commands.push(rect(plotX, plotY, plotWidth, plotHeight, white));

    for (let gridIndex = 1; gridIndex < 5; gridIndex += 1) {
      const gridX = plotX + (plotWidth / 5) * gridIndex;
      const gridY = plotY + (plotHeight / 5) * gridIndex;
      commands.push(line(gridX, plotY, gridX, plotY + plotHeight, softBlue, 0.6));
      commands.push(line(plotX, gridY, plotX + plotWidth, gridY, softBlue, 0.6));
    }

    const projectedPolygons = projectWinterPolygons(
      diagram.polygons,
      plotX,
      plotY,
      plotWidth,
      plotHeight,
    );
    const fills = [softAmber, softBlue, softGreen, softYellow];
    projectedPolygons.forEach((polygon, index) => {
      commands.push(polygonCommand(polygon, fills[index % fills.length]));
      const labelX = polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length;
      const labelY = polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length;
      commands.push(rect(labelX - 7, labelY - 7, 14, 14, brand));
      commands.push(text(String(index + 1), labelX - (index > 8 ? 5 : 2.5), labelY - 3, 7.5, white, "F2"));
    });

    commands.push(text("N", plotX + plotWidth - 17, plotY + plotHeight - 18, 8, brand, "F2"));
    commands.push(line(plotX + plotWidth - 14, plotY + plotHeight - 34, plotX + plotWidth - 14, plotY + plotHeight - 22, brand, 1.5));
    commands.push(text("Serverseitig geprüfte Flächenskizze", margin + 16, diagramBottom + 25, 8.5, muted));
    commands.push(
      text(
        `${diagram.polygons.length} Teilfläche(n) · insgesamt ${diagram.totalArea.toLocaleString("de-DE")} m²`,
        margin + 270,
        diagramBottom + 25,
        8.5,
        brand,
        "F2",
      ),
    );
    y -= diagramHeight + 18;
  }

  newPage();

  commands.push(
    text(
      isWinterRequest ? "Winterdienst Preiseinschätzung" : "Unverbindliche Einschätzung",
      margin,
      y,
      isWinterRequest ? 22 : 25,
      slate,
      "F2",
    ),
  );
  y -= 26;
  commands.push(
    text(
      "Hausmeisterservice, Objektbetreuung und Gebäudeservices in Hannover und Umgebung",
      margin,
      y,
      10.5,
      muted,
    ),
  );
  y -= 30;

  const estimateText = getEstimateText(lead);
  if (winterEstimate) {
    addWinterEstimateCard(winterEstimate);
    addInfoCard(
      "Wichtig: Diese Preiseinschätzung ist kein Angebot",
      "Die finale Kalkulation und ein verbindliches Angebot erfolgen erst nach Prüfung durch Hausvia und, falls erforderlich, nach einem Vor-Ort-Termin.",
    );
  } else if (estimateText) {
    addEstimateCard(estimateText);
  } else {
    addInfoCard("Klassische Anfrage", "Diese Anfrage enthält noch keine automatisierte Kostenspanne.");
  }

  addSection("Kontaktdaten");
  addRow("Name", valueAsString(lead.name));
  addRow("Firma / Verwaltung", valueAsString(lead.company));
  addRow("E-Mail", valueAsString(lead.email));
  addRow("Telefon", valueAsString(lead.phone));
  addRow("Adresse / Ort des Objekts", valueAsString(lead.objectAddress));
  addRow("Gewünschter Starttermin", valueAsString(lead.desiredStartDate));
  addRow("Gewünschte Rückrufzeit", valueAsString(lead.preferredCallbackTime));

  if (isWinterRequest) {
    addSection(
      "Winterdienst-Objektdaten",
      winterEstimate
        ? "Die Preisbestandteile wurden serverseitig aus den übernommenen Rechnerangaben neu berechnet."
        : "Die Angaben werden zur persönlichen Angebotserstellung geprüft.",
    );
    addRow("Anfragequelle", "Winterdienst-Rechner / Angebotsanfrage");
    addRow("Objektart", valueAsString(lead.objectTypeLabel ?? lead.objectType));
    const winterArea = valueAsNumber(winterPricingInput?.area ?? lead.winterArea ?? lead.winterMapArea);
    if (winterArea > 0) addRow("Winterdienstfläche", `${winterArea.toLocaleString("de-DE")} m²`);
    addRow("Flächenermittlung", valueAsString(lead.winterAreaSourceLabel));
    const polygonGroups = formatPolygonGroups(lead.winterPolygons);
    if (polygonGroups.length) {
      addRow("Markierte Teilflächen", `${polygonGroups.length} Fläche(n)`);
      for (const polygon of polygonGroups) addRow("Eckpunkte", polygon);
    } else {
      const polygonPoints = formatPolygonPoints(lead.winterPolygonPoints);
      if (polygonPoints) addRow("Markierte Eckpunkte", polygonPoints);
    }
    if (winterEstimate) {
      addRow("Bearbeitung der Fläche", valueAsString(lead.winterSurfaceProfileLabel));
      addRow("Zugänglichkeit", valueAsString(lead.winterAccessLabel));
      addRow("Einsatzbereitschaft / Zeiten", valueAsString(lead.winterReadinessLabel));
      const baseBreakdown = valueAsRecord(valueAsRecord(lead.estimate)?.baseBreakdown);
      const deploymentBreakdown = valueAsRecord(valueAsRecord(lead.estimate)?.deploymentBreakdown);
      const monthlyBaseSurchargeGross = valueAsNumber(baseBreakdown?.readinessSurchargeGross);
      const mobilizationGross = valueAsNumber(deploymentBreakdown?.mobilizationGross);
      const areaServiceGross = valueAsNumber(deploymentBreakdown?.areaServiceGross);
      const minimumAdjustmentGross = valueAsNumber(deploymentBreakdown?.minimumAdjustmentGross);
      const effectiveRate = valueAsNumber(deploymentBreakdown?.effectiveDeploymentRateGrossPerSquareMeter);
      const readinessSurchargeGross = valueAsNumber(deploymentBreakdown?.readinessSurchargeGross);
      if (mobilizationGross > 0) {
        addRow("Einsatzstart", `${formatEuro(mobilizationGross)} für Tour, Anfahrt und Disposition`);
      }
      if (areaServiceGross > 0) {
        addRow("Flächenleistung", `${formatEuro(areaServiceGross)} inkl. Standard-Streugut`);
      }
      if (minimumAdjustmentGross > 0) {
        addRow("Mindestansatz kleiner Flächen", formatEuro(minimumAdjustmentGross));
      }
      if (effectiveRate > 0) {
        addRow("Effektiver Einsatzpreis je m²", `${formatEuro(effectiveRate)} inkl. USt.`);
      }
      if (readinessSurchargeGross > 0) {
        if (monthlyBaseSurchargeGross > 0) {
          addRow(
            "24/7-Aufschlag Grundgebühr",
            `${formatEuro(monthlyBaseSurchargeGross)} monatlich (${winterEstimate.readinessSurchargePercent} % enthalten)`,
          );
        }
        addRow(
          "24/7-Aufschlag je variablem Einsatz",
          `${formatEuro(readinessSurchargeGross)} (${winterEstimate.readinessSurchargePercent} % enthalten)`,
        );
      }
      addRow(
        "Tarif Variabel",
        `${formatEuro(winterEstimate.pricingOptions.flex.monthlyBaseGross)} Grundgebühr pro Monat + ${formatEuro(winterEstimate.pricingOptions.flex.deploymentGross)} je Einsatz`,
      );
      addRow(
        "Tarif Pauschal",
        `${formatEuro(winterEstimate.pricingOptions.plan.monthlyGross)} pro Monat inkl. ${winterEstimate.pricingOptions.plan.includedDeployments} Einsätzen mit ${winterEstimate.pricingOptions.plan.deploymentDiscountPercent} % Einsatzrabatt`,
      );
      addRow(
        "Weitere Pauschal-Einsätze",
        `${formatEuro(winterEstimate.pricingOptions.plan.additionalDeploymentGross)} je weiterem Einsatz (Rabatt bleibt erhalten)`,
      );
      addRow("Vertragslaufzeit", winterEstimate.contractPeriod);
      addRow("Preise", `Beide Varianten inklusive ${winterEstimate.vatRate} % USt.`);
    }
    if (winterMapDiagram) {
      ensure(318);
      addSection(
        "Schematische Übersicht der markierten Flächen",
        "Die Darstellung wurde serverseitig ausschließlich aus den geprüften Eckpunkten erzeugt und ist keine Satellitenaufnahme.",
      );
      addWinterMapDiagram(winterMapDiagram);
    }
  } else {
    addSection("Objektdaten", "Grundlage der Einschätzung sind Objektart, Standort, Flächen, Häufigkeit und Komplexität.");
    addRow(
      "Anfragequelle",
      source === "cost-funnel"
        ? "Kostencheck / Service-Funnel"
        : source === "offer-request"
          ? "Kurze Angebotsanfrage"
          : "Kontaktformular",
    );
    addRow("Objektart", valueAsString(lead.objectTypeLabel ?? lead.objectType));
    addRow("Standort", valueAsString(lead.location));
    addRow("Außerhalb Standard-Einsatzgebiet", valueAsString(lead.outsideArea));
    addRow("Einheiten / Nutzbereiche", `${valueAsString(lead.unitCount, "0")} Einheit(en)`);
    addRow("Ø Fläche je Einheit", `${valueAsString(lead.averageUnitArea, "0")} m²`);
    addRow("Berechnete Wohn-/Nutzfläche", `${valueAsString(lead.computedUsableArea, "0")} m²`);
    addRow("Aktiv betreute Außenfläche", `${valueAsString(lead.outdoorArea, "0")} m²`);
    addRow("Häufigkeit", valueAsString(lead.frequencyLabel ?? lead.frequency));
    addRow("Komplexität", valueAsString(lead.complexityLabel ?? lead.complexity));
  }

  addSection("Anforderungen und Leistungen");
  if (!isWinterRequest) addRow("Rundum-Sorglos-Paket", valueAsString(lead.servicePackage));
  addRow("Gewünschte Leistungen", leadServices.join(", ") || valueAsString(lead.serviceInterest));
  addRow("Nachricht", valueAsString(lead.message));

  addSection("Wichtige Hinweise");
  if (winterEstimate) {
    addParagraph(
      `Variabel besteht aus der monatlichen flächenabhängigen Grundgebühr und dem Preis je tatsächlichem Einsatz. Das Pauschalpaket enthält ${winterEstimate.pricingOptions.plan.includedDeployments} Einsätze; jeder enthaltene und zusätzliche Einsatz ist gegenüber Variabel um ${winterEstimate.pricingOptions.plan.deploymentDiscountPercent} % reduziert. Zusätzliche Einsätze kosten ${formatEuro(winterEstimate.pricingOptions.plan.additionalDeploymentGross)}.`,
    );
    if (winterEstimate.readiness === "standard") {
      addParagraph(winterPricingConfig.standardCoverageNotice, 9.5, muted);
    } else if (winterEstimate.readinessSurchargePercent > 0) {
      addParagraph(
        `Beim 24/7 Gewerbe-Service ist der Aufschlag von ${winterEstimate.readinessSurchargePercent} % sowohl in der monatlichen Grundgebühr als auch in jedem Einsatzpreis enthalten.`,
        9.5,
        muted,
      );
    }
    addParagraph(
      "Die degressive Flächenkalkulation enthält Standard-Streugut und setzt zutreffende Flächen- und Zugänglichkeitsangaben voraus. Adresse, Leistungsflächen, Prioritäten und verfügbare Kapazitäten werden vor Vertragsschluss geprüft.",
    );
    addParagraph(
      "Diese Online-Preiseinschätzung stellt ausdrücklich kein Angebot dar. Die finale Kalkulation und ein verbindliches Angebot erfolgen erst nach Prüfung durch Hausvia und, falls erforderlich, nach einem Vor-Ort-Termin.",
      10,
      brand,
    );
  } else if (isWinterRequest) {
    addParagraph(
      "Diese Winterdienst-Anfrage enthält noch keine automatisierte Preiseinschätzung. Fläche, Zugänglichkeit, Leistungsumfang und Tourenkapazität werden vor einem Angebot persönlich geprüft.",
    );
  } else {
    addParagraph(
      "Diese Einschätzung ist unverbindlich und dient als erste Orientierung. Der finale Preis hängt von Objektzustand, Zugänglichkeit, Leistungsumfang, Häufigkeit, saisonalen Aufgaben und Abstimmung vor Ort ab.",
    );
    addParagraph(
      "Reparaturen, Instandsetzungen und größere Handwerksleistungen sind nicht automatisch enthalten und werden separat kalkuliert.",
    );
  }
  addParagraph(
    lead.termsAccepted === true
      ? "Die Anfrage wurde mit Zustimmung zur Datenschutzerklärung und zu den AGB übermittelt."
      : "Die Anfrage wurde mit Zustimmung zur Datenschutzerklärung übermittelt.",
  );

  addInfoCard(
    SITE.name,
    `${SITE.legalName} · ${SITE.address} · Telefon: ${SITE.phone} · E-Mail: ${SITE.email}`,
  );

  return createPdf(pages);
}
