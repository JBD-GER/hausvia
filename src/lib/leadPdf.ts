import { SITE } from "@/lib/site";

type LeadRecord = Record<string, unknown>;

type LeadPdfInput = {
  source: string;
  submittedAt: string;
  lead: LeadRecord;
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

function formatEuro(value: number) {
  return `${value.toLocaleString("de-DE")} €`;
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
  return `${formatEuro(lower)}–${formatEuro(upper)} pro Monat`;
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

  function newPage() {
    commands = [];
    pages.push(commands);
    commands.push(rect(0, 782, pageWidth, 60, brand));
    commands.push(rect(0, 760, pageWidth, 22, yellow));
    commands.push(text("Hausvia", margin, 808, 24, white, "F2"));
    commands.push(text("HAUSMEISTERSERVICE", margin, 790, 8, white, "F2"));
    commands.push(text("PDF-Ersteinschätzung für Objektbetreuung", margin, 767, 11, brand, "F2"));
    commands.push(text(`Erstellt am ${formatDate(submittedAt)}`, 380, 767, 9, brand));
    y = 730;
  }

  function ensure(space = 32) {
    if (y - space < 58) newPage();
  }

  function addSection(title: string) {
    ensure(42);
    commands.push(text(title, margin, y, 15, brand, "F2"));
    y -= 9;
    commands.push(line(margin, y, pageWidth - margin, y, yellow));
    y -= 20;
  }

  function addParagraph(value: string) {
    for (const paragraphLine of wrapText(value, 92)) {
      ensure(16);
      commands.push(text(paragraphLine, margin, y, 10, slate));
      y -= 15;
    }
    y -= 5;
  }

  function addRow(label: string, value: string) {
    const wrapped = wrapText(value || "-", 66);
    ensure(18 + wrapped.length * 12);
    commands.push(text(label, margin, y, 9, muted, "F2"));
    commands.push(text(wrapped[0], 210, y, 10, slate));
    y -= 14;
    wrapped.slice(1).forEach((wrappedLine) => {
      commands.push(text(wrappedLine, 210, y, 10, slate));
      y -= 14;
    });
  }

  newPage();

  commands.push(text("Unverbindliche Einschätzung", margin, y, 26, slate, "F2"));
  y -= 22;
  commands.push(
    text(
      "Hausmeisterservice, Objektbetreuung und Gebäudeservices in Hannover und Umgebung",
      margin,
      y,
      11,
      muted,
    ),
  );
  y -= 32;

  const estimateText = getEstimateText(lead);
  if (estimateText) {
    commands.push(rect(margin, y - 74, pageWidth - margin * 2, 86, softYellow));
    commands.push(text("Monatliche Ersteinschätzung", margin + 18, y - 10, 10, brand, "F2"));
    commands.push(text(`ca. ${estimateText}`, margin + 18, y - 40, 24, slate, "F2"));
    commands.push(text("Kein verbindliches Angebot. Detailprüfung empfohlen.", margin + 18, y - 62, 10, muted));
    y -= 108;
  } else {
    commands.push(rect(margin, y - 56, pageWidth - margin * 2, 68, softBlue));
    commands.push(text("Klassische Anfrage", margin + 18, y - 12, 12, brand, "F2"));
    commands.push(text("Diese Anfrage enthält noch keine automatisierte Kostenspanne.", margin + 18, y - 36, 11, slate));
    y -= 90;
  }

  addSection("Kontaktdaten");
  addRow("Name", valueAsString(lead.name));
  addRow("Firma / Verwaltung", valueAsString(lead.company));
  addRow("E-Mail", valueAsString(lead.email));
  addRow("Telefon", valueAsString(lead.phone));
  addRow("Adresse / Ort des Objekts", valueAsString(lead.objectAddress));

  addSection("Objektdaten");
  addRow("Anfragequelle", source === "cost-funnel" ? "Kostencheck / Service-Funnel" : "Kontaktformular");
  addRow("Objektart", valueAsString(lead.objectTypeLabel ?? lead.objectType));
  addRow("Standort", valueAsString(lead.location));
  addRow("Außerhalb Standard-Einsatzgebiet", valueAsString(lead.outsideArea));
  addRow("Einheiten / Nutzbereiche", `${valueAsString(lead.unitCount, "0")} Einheit(en)`);
  addRow("Ø Fläche je Einheit", `${valueAsString(lead.averageUnitArea, "0")} m²`);
  addRow("Berechnete Wohn-/Nutzfläche", `${valueAsString(lead.computedUsableArea, "0")} m²`);
  addRow("Aktiv betreute Außenfläche", `${valueAsString(lead.outdoorArea, "0")} m²`);
  addRow("Häufigkeit", valueAsString(lead.frequencyLabel ?? lead.frequency));
  addRow("Komplexität", valueAsString(lead.complexityLabel ?? lead.complexity));

  const services = valueAsStringList(lead.selectedServiceLabels).length
    ? valueAsStringList(lead.selectedServiceLabels)
    : valueAsStringList(lead.services);

  addSection("Anforderungen und Leistungen");
  addRow("Rundum-Sorglos-Paket", valueAsString(lead.servicePackage));
  addRow("Gewünschte Leistungen", services.join(", ") || valueAsString(lead.serviceInterest));
  addRow("Nachricht", valueAsString(lead.message));

  addSection("Wichtige Hinweise");
  addParagraph(
    "Diese Einschätzung ist unverbindlich und dient als erste Orientierung. Der finale Preis hängt von Objektzustand, Zugänglichkeit, Leistungsumfang, Häufigkeit, saisonalen Aufgaben und Abstimmung vor Ort ab.",
  );
  addParagraph(
    "Reparaturen, Instandsetzungen und größere Handwerksleistungen sind nicht automatisch enthalten und werden separat kalkuliert.",
  );
  addParagraph(
    "Die Anfrage wurde mit Zustimmung zu Datenschutz und AGB übermittelt. Rechtliche Pflichttexte sind vor Veröffentlichung final zu prüfen.",
  );

  ensure(70);
  commands.push(rect(margin, y - 48, pageWidth - margin * 2, 58, softBlue));
  commands.push(text(SITE.name, margin + 16, y - 8, 13, brand, "F2"));
  commands.push(text(`${SITE.legalName} · ${SITE.address}`, margin + 16, y - 26, 9, slate));
  commands.push(text(`Telefon: ${SITE.phone} · E-Mail: ${SITE.email}`, margin + 16, y - 42, 9, slate));

  return createPdf(pages);
}
