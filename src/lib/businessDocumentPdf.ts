import { formatEuro, type CommerceLineItem, type DocumentTotals } from "@/lib/commerce";
import { SITE } from "@/lib/site";

type Party = {
  companyName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type BusinessDocumentInput = {
  kind: "offer" | "invoice";
  number: string;
  title: string;
  intro?: string | null;
  customer: Party;
  project?: {
    name?: string | null;
    objectAddress?: string | null;
    objectType?: string | null;
  } | null;
  items: CommerceLineItem[];
  totals: DocumentTotals;
  createdAt?: string;
  dueDate?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  billingNote?: string | null;
  closingText?: string | null;
};

const pageWidth = 595;
const pageHeight = 842;
const margin = 44;
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

function colorCommand(color: typeof brand, type: "fill" | "stroke" = "fill") {
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

function clean(value?: string | null, fallback = "-") {
  return value?.trim() || fallback;
}

function dateText(value?: string | null) {
  if (!value) return new Date().toLocaleDateString("de-DE");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE");
}

function wrapText(value: string, maxChars: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
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

export function createBusinessDocumentPdf(input: BusinessDocumentInput) {
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;
  const contentWidth = pageWidth - margin * 2;
  const documentLabel = input.kind === "offer" ? "Angebot" : "Rechnung";

  function newPage() {
    commands = [];
    pages.push(commands);
    commands.push(rect(0, 762, pageWidth, 80, brand));
    commands.push(rect(0, 736, pageWidth, 26, yellow));
    commands.push(text("Hausvia", margin, 807, 25, white, "F2"));
    commands.push(text("HAUSMEISTERSERVICE", margin, 787, 8, white, "F2"));
    commands.push(text(documentLabel, margin, 745, 12, brand, "F2"));
    commands.push(text(input.number, 348, 745, 9.5, brand, "F2"));
    commands.push(text(`Erstellt am ${dateText(input.createdAt)}`, 348, 730, 8, muted));
    commands.push(line(margin, 68, pageWidth - margin, 68, softBlue));
    commands.push(text(SITE.legalName, margin, 52, 7.5, slate, "F2"));
    commands.push(text(SITE.address, margin, 41, 7, muted));
    commands.push(text(`E-Mail: ${SITE.email} · Telefon: ${SITE.phone}`, 238, 52, 7, muted));
    commands.push(text(`${SITE.register} · USt-IdNr.: ${SITE.vatId}`, 238, 41, 7, muted));
    y = 700;
  }

  function ensure(space = 40) {
    if (y - space < 80) newPage();
  }

  function addParagraph(value: string, size = 9.5, color = muted, maxChars = 88) {
    for (const wrappedLine of wrapText(value, maxChars)) {
      ensure(size + 10);
      commands.push(text(wrappedLine, margin, y, size, color));
      y -= size + 5;
    }
  }

  function addSection(title: string) {
    ensure(42);
    y -= 8;
    commands.push(text(title, margin, y, 14, brand, "F2"));
    y -= 12;
    commands.push(line(margin, y, pageWidth - margin, y, yellow));
    y -= 18;
  }

  function addInfoPair(label: string, value: string, x: number, top: number) {
    commands.push(text(label, x, top, 8, muted, "F2"));
    for (const [index, wrappedLine] of wrapText(value, 34).entries()) {
      commands.push(text(wrappedLine, x, top - 14 - index * 12, 9, slate));
    }
  }

  function addMetaBox() {
    const boxHeight = 114;
    ensure(boxHeight);
    commands.push(rect(margin, y - boxHeight + 8, contentWidth, boxHeight, softSlate));
    commands.push(text("Empfänger und Objekt", margin + 16, y - 16, 10, brand, "F2"));
    commands.push(text("Dokument", margin + 370, y - 16, 10, brand, "F2"));
    addInfoPair("Kunde", clean(input.customer.companyName || input.customer.contactName), margin + 16, y - 38);
    addInfoPair("Kontakt", clean(input.customer.email), margin + 190, y - 38);
    addInfoPair("Datum", dateText(input.createdAt), margin + 370, y - 38);
    if (input.customer.address) {
      addInfoPair("Objekt / Adresse", clean(input.customer.address), margin + 16, y - 80);
    }
    if (input.project?.name || input.project?.objectAddress) {
      addInfoPair("Projekt", clean(input.project.name || input.project.objectAddress), margin + 190, y - 80);
    }
    if (input.dueDate) {
      addInfoPair("Fällig", dateText(input.dueDate), margin + 370, y - 80);
    }
    y -= boxHeight + 18;
  }

  function addItems() {
    addSection("Positionen");
    const headerY = y;
    commands.push(rect(margin, headerY - 24, contentWidth, 26, brand));
    commands.push(text("Leistung", margin + 12, headerY - 15, 8, white, "F2"));
    commands.push(text("Menge", 330, headerY - 15, 8, white, "F2"));
    commands.push(text("Einheit", 383, headerY - 15, 8, white, "F2"));
    commands.push(text("Netto", 458, headerY - 15, 8, white, "F2"));
    y -= 34;

    input.items.forEach((item, index) => {
      const titleLines = wrapText(item.title, 38);
      const descriptionLines = item.description ? wrapText(item.description, 54).slice(0, 3) : [];
      const rowHeight = Math.max(42, 18 + (titleLines.length + descriptionLines.length) * 12);
      ensure(rowHeight + 4);
      commands.push(rect(margin, y - rowHeight + 8, contentWidth, rowHeight, index % 2 === 0 ? softBlue : white));
      titleLines.forEach((wrappedLine, lineIndex) => {
        commands.push(text(wrappedLine, margin + 12, y - 8 - lineIndex * 12, 9, slate, "F2"));
      });
      descriptionLines.forEach((wrappedLine, lineIndex) => {
        commands.push(text(wrappedLine, margin + 12, y - 8 - (titleLines.length + lineIndex) * 12, 8, muted));
      });
      commands.push(text(String(item.quantity).replace(".", ","), 330, y - 10, 8.5, slate));
      commands.push(text(item.unit, 383, y - 10, 8.5, slate));
      commands.push(text(formatEuro(item.totalNet), 458, y - 10, 8.5, slate, "F2"));
      y -= rowHeight + 3;
    });
  }

  function addTotals() {
    ensure(108);
    const boxX = 344;
    const boxWidth = pageWidth - margin - boxX;
    commands.push(rect(boxX, y - 94, boxWidth, 100, softYellow));
    commands.push(text("Summe netto", boxX + 16, y - 18, 9, muted, "F2"));
    commands.push(text(formatEuro(input.totals.netTotal), boxX + 112, y - 18, 9, slate, "F2"));
    commands.push(text(`zzgl. ${input.totals.taxRate}% USt.`, boxX + 16, y - 42, 9, muted, "F2"));
    commands.push(text(formatEuro(input.totals.taxTotal), boxX + 112, y - 42, 9, slate, "F2"));
    commands.push(line(boxX + 16, y - 58, boxX + boxWidth - 16, y - 58, yellow, 1.2));
    commands.push(text("Gesamt brutto", boxX + 16, y - 76, 11, brand, "F2"));
    commands.push(text(formatEuro(input.totals.grossTotal), boxX + 112, y - 76, 11, brand, "F2"));
    y -= 116;
  }

  function addNotes() {
    if (input.kind === "offer" && input.billingNote) {
      addSection("Abrechnung");
      addParagraph(input.billingNote, 9.5, slate);
    }

    if (input.kind === "offer" && input.closingText) {
      addSection("Nächster Schritt");
      addParagraph(input.closingText, 9.5, slate);
    }

    if (input.kind === "invoice" && (input.servicePeriodStart || input.servicePeriodEnd || input.billingNote)) {
      addSection("Abrechnungshinweis");
      if (input.servicePeriodStart || input.servicePeriodEnd) {
        addParagraph(
          `Leistungszeitraum: ${dateText(input.servicePeriodStart)} bis ${dateText(input.servicePeriodEnd)}.`,
          9.5,
          slate,
        );
      }
      if (input.billingNote) addParagraph(input.billingNote, 9.5, slate);
    }

    addSection(input.kind === "offer" ? "Hinweis zum Angebot" : "Hinweis zur Rechnung");
    addParagraph(
      input.kind === "offer"
        ? "Dieses Angebot wurde auf Grundlage der bekannten Objekt- und Leistungsdaten erstellt. Änderungen am Leistungsumfang, zusätzliche Sonderleistungen oder saisonale Aufgaben können separat kalkuliert werden."
        : "Bitte begleichen Sie die Rechnung zum angegebenen Fälligkeitsdatum. Bei Rückfragen zum Leistungsumfang oder zum Abrechnungszeitraum melden Sie sich bitte direkt bei Hausvia.",
      9.5,
      slate,
    );
    addParagraph(
      "Reparaturen, Instandsetzungen und größere Handwerksleistungen sind nur enthalten, wenn sie ausdrücklich als Position aufgeführt sind.",
      9.5,
      slate,
    );
  }

  newPage();
  commands.push(text(input.title, margin, y, 24, slate, "F2"));
  y -= 24;
  commands.push(text(`${documentLabel} ${input.number}`, margin, y, 10, muted));
  y -= 28;
  if (input.intro) {
    addParagraph(input.intro, 10, muted, 86);
    y -= 12;
  }
  addMetaBox();
  addItems();
  addTotals();
  addNotes();

  return createPdf(pages);
}
