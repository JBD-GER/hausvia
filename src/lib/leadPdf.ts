import { SITE } from "@/lib/site";

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

function line(x1: number, y1: number, x2: number, y2: number, color: typeof brand) {
  return `q ${colorCommand(color, "stroke")} 1 w ${x1} ${y1} m ${x2} ${y2} l S Q`;
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

function formatEuro(value: number) {
  return `${value.toLocaleString("de-DE")} EUR`;
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

  return {
    monthlyBaseGross,
    seasonBaseGross,
    deploymentGross,
    seasonMonths: valueAsNumber(estimate.seasonMonths) || 5,
    contractPeriod: valueAsString(estimate.contractPeriod, "1. November bis 31. März"),
    vatRate: valueAsNumber(estimate.vatRate) || 19,
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

function createPdf(pages: string[][]) {
  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => 5 + index * 2);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((commands, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const content = commands.join("\n");
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
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
        isWinterRequest ? "Winterdienst-Anfrage" : "Kosteneinschätzung für Objektbetreuung",
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
    const cardHeight = 138;
    ensure(cardHeight + 18);
    commands.push(rect(margin, y - cardHeight + 8, contentWidth, cardHeight, softYellow));
    commands.push(rect(margin, y - cardHeight + 8, 5, cardHeight, yellow));
    commands.push(text("WINTERDIENST · ZWEITEILIGES PREISMODELL", margin + 20, y - 16, 9, brand, "F2"));
    commands.push(
      text(
        `${formatEuro(estimate.monthlyBaseGross)} Grundbetrag pro Monat`,
        margin + 20,
        y - 45,
        18,
        slate,
        "F2",
      ),
    );
    commands.push(
      text(
        `${formatEuro(estimate.seasonBaseGross)} fester Grundbetrag für ${estimate.seasonMonths} Monate`,
        margin + 20,
        y - 69,
        10,
        muted,
      ),
    );
    commands.push(
      text(
        `+ ${formatEuro(estimate.deploymentGross)} je tatsächlichem Einsatz`,
        margin + 20,
        y - 98,
        16,
        brand,
        "F2",
      ),
    );
    commands.push(
      text(
        `Vertragslaufzeit ${estimate.contractPeriod} · Preise inkl. ${estimate.vatRate} % USt.`,
        margin + 20,
        y - 122,
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

  newPage();

  commands.push(
    text(
      isWinterRequest ? "Unverbindliche Winterdienst-Anfrage" : "Unverbindliche Einschätzung",
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
    const polygonPoints = formatPolygonPoints(lead.winterPolygonPoints);
    if (polygonPoints) addRow("Markierte Eckpunkte", polygonPoints);
    if (winterEstimate) {
      addRow("Bearbeitung der Fläche", valueAsString(lead.winterSurfaceProfileLabel));
      addRow("Zugänglichkeit", valueAsString(lead.winterAccessLabel));
      addRow("Vertragslaufzeit", winterEstimate.contractPeriod);
      addRow("Abrechnung", "Fester Saison-Grundbetrag plus Preis je tatsächlichem Einsatz");
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
      "Der Saison-Grundbetrag fällt während der fünf Vertragsmonate unabhängig von der Anzahl der Einsätze an. Der Einsatzpreis wird zusätzlich nur berechnet, wenn am Objekt tatsächlich geräumt oder gestreut wird.",
    );
    addParagraph(
      "Die Einschätzung setzt zutreffende Flächen- und Zugänglichkeitsangaben voraus. Adresse, Leistungsflächen, Prioritäten und verfügbare Kapazitäten werden vor Vertragsschluss geprüft.",
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
    "Die Anfrage wurde mit Zustimmung zu Datenschutz und AGB übermittelt. Rechtliche Pflichttexte sind vor Veröffentlichung final zu prüfen.",
  );

  addInfoCard(
    SITE.name,
    `${SITE.legalName} · ${SITE.address} · Telefon: ${SITE.phone} · E-Mail: ${SITE.email}`,
  );

  return createPdf(pages);
}
