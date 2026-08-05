import { formatEuro, type CommerceLineItem, type DocumentTotals } from "./commerce.ts";
import {
  createHausviaPdfLogoObject,
  drawHausviaPdfLogo,
  hausviaPdfLogoResourceName,
} from "./pdfBrandLogo.ts";
import { SITE } from "./site.ts";

type Party = {
  companyName?: string | null;
  contactName?: string | null;
  addition?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type BusinessDocumentLineItem = CommerceLineItem & {
  details?: string[];
  billingLabel?: string | null;
};

export type BusinessDocumentBillingBucket = {
  key: string;
  label: string;
  suffix?: string | null;
  subtotalCents: number;
  discountCents: number;
  netCents: number;
  taxCents: number;
  grossCents: number;
};

export type BusinessDocumentDiscount = {
  label: string;
  detail?: string | null;
  amountCents: number;
};

export type BusinessDocumentAcceptance = {
  statement: string;
  completed?: boolean;
  acceptedName?: string | null;
  acceptedAt?: string | null;
  comment?: string | null;
  versionLabel?: string | null;
  confirmedGrossTotalCents?: number | null;
  confirmedContentSha256?: string | null;
};

export type InvoiceIssuerSnapshot = {
  legalName: string;
  brandName?: string | null;
  address: string;
  taxNumber?: string | null;
  vatId?: string | null;
  commercialRegister?: string | null;
  managingDirector?: string | null;
  email: string;
  phone?: string | null;
  bankName: string;
  iban: string;
  bic: string;
};

export type BusinessDocumentInput = {
  kind: "offer" | "invoice" | "offer_acceptance";
  number: string;
  title: string;
  intro?: string | null;
  customer: Party;
  project?: {
    name?: string | null;
    objectAddress?: string | null;
    objectType?: string | null;
  } | null;
  items: BusinessDocumentLineItem[];
  totals: DocumentTotals;
  taxBreakdown?: Array<{ taxRateBps: number; taxCents: number }>;
  billingBuckets?: BusinessDocumentBillingBucket[];
  discounts?: BusinessDocumentDiscount[];
  hidePricingSummary?: boolean;
  createdAt?: string;
  validUntil?: string | null;
  versionLabel?: string | null;
  dueDate?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  billingNote?: string | null;
  closingText?: string | null;
  visibleNote?: string | null;
  paymentTerms?: string | null;
  contractTerms?: string | null;
  acceptance?: BusinessDocumentAcceptance | null;
  issuer?: InvoiceIssuerSnapshot | null;
};

const pageWidth = 595;
const pageHeight = 842;
const margin = 44;
const brand = { r: 0.031, g: 0.169, b: 0.38 };
const slate = { r: 0.094, g: 0.126, b: 0.2 };
const muted = { r: 0.31, g: 0.36, b: 0.43 };
const teal = { r: 0.031, g: 0.682, b: 0.706 };
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
  const formatter = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" });
  if (!value) return formatter.format(new Date());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatter.format(date);
}

function centsText(value: number) {
  return formatEuro(value / 100);
}

function wrapText(value: string, maxChars: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const rawWord of words) {
    let word = rawWord;
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      while (word.length > maxChars) {
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!word) continue;
    }
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
  const logoObjectId = 5;
  const firstPageId = 6;
  const pageRefs = pages.map((_, index) => firstPageId + index * 2);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[logoObjectId - 1] = createHausviaPdfLogoObject();

  pages.forEach((commands, index) => {
    const pageId = firstPageId + index * 2;
    const contentId = pageId + 1;
    const content = commands.join("\n");
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /${hausviaPdfLogoResourceName} ${logoObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
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

export function createBusinessDocumentPdf(input: BusinessDocumentInput) {
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;
  const contentWidth = pageWidth - margin * 2;
  const documentLabel =
    input.kind === "invoice"
      ? "Rechnung"
      : input.kind === "offer_acceptance"
        ? "Annahmebestätigung"
        : "Angebot";
  const isOfferDocument = input.kind !== "invoice";
  const issuer = input.issuer;
  const issuerLegalName = issuer?.legalName || SITE.legalName;
  const issuerAddress = issuer?.address || SITE.address;
  const issuerEmail = issuer?.email || SITE.email;
  const issuerPhone = issuer ? issuer.phone?.trim() || "-" : SITE.phone;
  const issuerRegister = issuer ? issuer.commercialRegister?.trim() || "" : SITE.register;

  function newPage() {
    commands = [];
    pages.push(commands);
    commands.push(rect(0, 0, pageWidth, pageHeight, white));
    commands.push(drawHausviaPdfLogo(margin, 786, 208));
    commands.push(text(documentLabel, 386, 811, 14, brand, "F2"));
    commands.push(text(input.number, 386, 791, 9.5, muted, "F2"));
    commands.push(rect(0, 736, pageWidth, 30, softBlue));
    commands.push(rect(0, 736, pageWidth, 4, teal));
    commands.push(text(SITE.slogan, margin, 748, 9, brand, "F2"));
    commands.push(
      text(
        `${input.kind === "offer" ? "Angebotsdatum" : "Erstellt am"} ${dateText(input.createdAt)}`,
        348,
        748,
        8,
        muted,
      ),
    );
    commands.push(line(margin, 68, pageWidth - margin, 68, softBlue));
    commands.push(text(issuerLegalName, margin, 52, 7.5, slate, "F2"));
    commands.push(text(issuerAddress, margin, 41, 7, muted));
    commands.push(text(`E-Mail: ${issuerEmail} · Telefon: ${issuerPhone}`, 238, 52, 7, muted));
    commands.push(text(issuerRegister, 238, 41, 7, muted));
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

  function addInfoPair(label: string, value: string, x: number, top: number, maxChars = 34) {
    commands.push(text(label, x, top, 8, muted, "F2"));
    for (const [index, wrappedLine] of wrapText(value, maxChars).slice(0, 3).entries()) {
      commands.push(text(wrappedLine, x, top - 14 - index * 12, 9, slate));
    }
  }

  function addMetaBox() {
    const boxHeight = 152;
    ensure(boxHeight);
    commands.push(rect(margin, y - boxHeight + 8, contentWidth, boxHeight, softSlate));
    commands.push(text("Empfänger", margin + 16, y - 16, 10, brand, "F2"));
    commands.push(text("Dokument", margin + 370, y - 16, 10, brand, "F2"));
    addInfoPair(
      input.kind === "invoice" ? "Rechnungsempfänger" : "Kunde",
      clean([input.customer.companyName, input.customer.addition || input.customer.contactName].filter(Boolean).join(" · ")),
      margin + 16,
      y - 38,
      28,
    );
    addInfoPair("Datum", dateText(input.createdAt), margin + 370, y - 38, 24);
    if (input.versionLabel) {
      addInfoPair("Version", input.versionLabel, margin + 370, y - 76, 24);
    }
    if (input.validUntil) {
      addInfoPair("Gültig bis", dateText(input.validUntil), margin + 370, y - 110, 24);
    } else if (input.dueDate) {
      addInfoPair("Fällig", dateText(input.dueDate), margin + 370, y - 110, 24);
    }
    if (input.customer.address) {
      addInfoPair("Empfängeranschrift", clean(input.customer.address), margin + 16, y - 82, 30);
    }
    if (input.project?.name || input.project?.objectAddress) {
      addInfoPair(
        "Objekt",
        clean([input.project.name, input.project.objectAddress].filter(Boolean).join(" · ")),
        margin + 225,
        y - 38,
        20,
      );
    }
    if (input.customer.email || input.customer.phone) {
      addInfoPair(
        "Kontakt",
        clean([input.customer.email, input.customer.phone].filter(Boolean).join(" · ")),
        margin + 225,
        y - 100,
        20,
      );
    }
    y -= boxHeight + 18;
  }

  function addMetadataOverflow() {
    const values = [
      {
        label: input.kind === "invoice" ? "Vollständiger Rechnungsempfänger" : "Vollständiger Empfänger",
        value: clean([input.customer.companyName, input.customer.addition || input.customer.contactName].filter(Boolean).join(" · ")),
        maxChars: 28,
      },
      { label: "Vollständige Empfängeranschrift", value: clean(input.customer.address), maxChars: 30 },
      {
        label: "Vollständige Objektangabe",
        value: clean([input.project?.name, input.project?.objectAddress].filter(Boolean).join(" · ")),
        maxChars: 20,
      },
      {
        label: "Vollständiger Kontakt",
        value: clean([input.customer.email, input.customer.phone].filter(Boolean).join(" · ")),
        maxChars: 20,
      },
    ].filter((entry) => entry.value !== "-" && wrapText(entry.value, entry.maxChars).length > 3);
    if (!values.length) return;
    addSection("Vollständige Empfänger- und Objektdaten");
    for (const entry of values) {
      addParagraph(`${entry.label}: ${entry.value}`, 9, slate, 82);
    }
    y -= 6;
  }

  function addItemsHeader(continued = false) {
    if (continued) {
      commands.push(text("Positionen · Fortsetzung", margin, y, 12, brand, "F2"));
      y -= 20;
    }
    const headerY = y;
    commands.push(rect(margin, headerY - 24, contentWidth, 26, brand));
    commands.push(text("Leistung", margin + 12, headerY - 15, 8, white, "F2"));
    commands.push(text("Menge", 318, headerY - 15, 8, white, "F2"));
    commands.push(text("Einheit", 368, headerY - 15, 8, white, "F2"));
    commands.push(text("Einzelpreis / Abrechnung", 425, headerY - 15, 8, white, "F2"));
    y -= 34;
  }

  function addItems() {
    if (!input.items.length) return;
    addSection("Positionen");
    addItemsHeader();

    input.items.forEach((item, index) => {
      const leftLines = [
        ...wrapText(item.title, 36).map((value) => ({ value, size: 9, color: slate, font: "F2" })),
        ...(item.description
          ? wrapText(item.description, 48).map((value) => ({ value, size: 8, color: muted, font: "F1" }))
          : []),
        ...(item.details ?? []).flatMap((detail) =>
          wrapText(detail, 48).map((value) => ({ value, size: 7.5, color: muted, font: "F1" })),
        ),
      ];
      const unitPriceLabel = item.unitNet > 0 ? `Einzelpreis ${formatEuro(item.unitNet)}` : "";
      const billingLines = [unitPriceLabel, item.billingLabel || formatEuro(item.totalNet)]
        .filter(Boolean)
        .flatMap((value) => wrapText(value, 18));
      let leftOffset = 0;
      let billingOffset = 0;
      let segment = 0;

      do {
        let availableLines = Math.floor((y - 80 - 18) / 11);
        if (availableLines < 1) {
          newPage();
          addItemsHeader(true);
          availableLines = Math.floor((y - 80 - 18) / 11);
        }

        const leftChunk = leftLines.slice(leftOffset, leftOffset + availableLines);
        const billingChunk = billingLines.slice(billingOffset, billingOffset + availableLines);
        const renderedLineCount = Math.max(leftChunk.length, billingChunk.length, 1);
        const rowHeight = Math.max(44, 18 + renderedLineCount * 11);
        commands.push(rect(margin, y - rowHeight + 8, contentWidth, rowHeight, index % 2 === 0 ? softBlue : white));
        leftChunk.forEach((wrappedLine, lineIndex) => {
          commands.push(
            text(
              wrappedLine.value,
              margin + 12,
              y - 8 - lineIndex * 11,
              wrappedLine.size,
              wrappedLine.color,
              wrappedLine.font,
            ),
          );
        });
        if (segment === 0) {
          commands.push(text(String(item.quantity).replace(".", ","), 318, y - 10, 8.5, slate));
          commands.push(text(item.unit, 368, y - 10, 8.5, slate));
        } else {
          commands.push(text("Fortsetzung", 318, y - 10, 7.5, muted));
        }
        billingChunk.forEach((wrappedLine, lineIndex) => {
          commands.push(text(wrappedLine, 425, y - 10 - lineIndex * 11, 8.3, slate, "F2"));
        });
        leftOffset += leftChunk.length;
        billingOffset += billingChunk.length;
        segment += 1;
        y -= rowHeight + 3;

        if (leftOffset < leftLines.length || billingOffset < billingLines.length) {
          newPage();
          addItemsHeader(true);
        }
      } while (leftOffset < leftLines.length || billingOffset < billingLines.length);
    });
  }

  function addTraditionalTotals() {
    const taxRows = input.taxBreakdown?.length
      ? input.taxBreakdown
      : [{ taxRateBps: Math.round(input.totals.taxRate * 100), taxCents: Math.round(input.totals.taxTotal * 100) }];
    const boxHeight = 76 + taxRows.length * 24;
    ensure(boxHeight + 8);
    const boxX = 344;
    const boxWidth = pageWidth - margin - boxX;
    commands.push(rect(boxX, y - boxHeight + 6, boxWidth, boxHeight, softYellow));
    commands.push(text("Summe netto", boxX + 16, y - 18, 9, muted, "F2"));
    commands.push(text(formatEuro(input.totals.netTotal), boxX + 112, y - 18, 9, slate, "F2"));
    taxRows.forEach((row, index) => {
      const rowY = y - 42 - index * 24;
      commands.push(text(`zzgl. ${(row.taxRateBps / 100).toLocaleString("de-DE")}% USt.`, boxX + 16, rowY, 9, muted, "F2"));
      commands.push(text(formatEuro(row.taxCents / 100), boxX + 112, rowY, 9, slate, "F2"));
    });
    const dividerY = y - 34 - taxRows.length * 24;
    commands.push(line(boxX + 16, dividerY, boxX + boxWidth - 16, dividerY, yellow, 1.2));
    commands.push(text("Gesamt brutto", boxX + 16, dividerY - 18, 11, brand, "F2"));
    commands.push(text(formatEuro(input.totals.grossTotal), boxX + 112, dividerY - 18, 11, brand, "F2"));
    y -= boxHeight + 16;
  }

  function addDiscounts() {
    if (!input.discounts?.length) return;
    ensure(78);
    addSection("Rabatte");
    input.discounts.forEach((discount, index) => {
      const detail = discount.detail ? ` · ${discount.detail}` : "";
      const lines = wrapText(`${discount.label}${detail}`, 66);
      let offset = 0;
      let segment = 0;
      while (offset < lines.length) {
        let availableLines = Math.floor((y - 80 - 12) / 11);
        if (availableLines < 1) {
          newPage();
          commands.push(text("Rabatte · Fortsetzung", margin, y, 12, brand, "F2"));
          y -= 24;
          availableLines = Math.floor((y - 80 - 12) / 11);
        }
        const chunk = lines.slice(offset, offset + availableLines);
        const rowHeight = Math.max(28, chunk.length * 11 + 12);
        commands.push(rect(margin, y - rowHeight + 7, contentWidth, rowHeight, index % 2 === 0 ? softSlate : white));
        chunk.forEach((wrappedLine, lineIndex) => {
          commands.push(text(wrappedLine, margin + 12, y - 7 - lineIndex * 11, 8.5, slate));
        });
        if (segment === 0) {
          commands.push(text(`-${centsText(discount.amountCents)}`, 448, y - 7, 8.5, brand, "F2"));
        }
        offset += chunk.length;
        segment += 1;
        y -= rowHeight + 2;
        if (offset < lines.length) {
          newPage();
          commands.push(text("Rabatte · Fortsetzung", margin, y, 12, brand, "F2"));
          y -= 24;
        }
      }
    });
    y -= 6;
  }

  function addBillingBuckets() {
    const buckets = (input.billingBuckets ?? []).filter(
      (bucket) => bucket.subtotalCents > 0 || bucket.discountCents > 0 || bucket.grossCents > 0,
    );
    if (!buckets.length) {
      addTraditionalTotals();
      return;
    }

    ensure(104);
    addSection("Preisübersicht nach Abrechnung");
    buckets.forEach((bucket, index) => {
      const rowHeight = 58;
      ensure(rowHeight + 4);
      commands.push(rect(margin, y - rowHeight + 8, contentWidth, rowHeight, index % 2 === 0 ? softYellow : softSlate));
      commands.push(text(bucket.label, margin + 14, y - 10, 10, brand, "F2"));
      if (bucket.suffix) commands.push(text(bucket.suffix, margin + 14, y - 26, 7.5, muted));
      commands.push(text("Netto", 243, y - 10, 7.5, muted, "F2"));
      commands.push(text(centsText(bucket.netCents), 243, y - 27, 9, slate, "F2"));
      commands.push(text("USt.", 334, y - 10, 7.5, muted, "F2"));
      commands.push(text(centsText(bucket.taxCents), 334, y - 27, 9, slate, "F2"));
      commands.push(text("Brutto", 425, y - 10, 7.5, muted, "F2"));
      commands.push(text(centsText(bucket.grossCents), 425, y - 27, 10, brand, "F2"));
      if (bucket.discountCents > 0) {
        commands.push(
          text(
            `vor Rabatt ${centsText(bucket.subtotalCents)} · Rabatt ${centsText(bucket.discountCents)}`,
            243,
            y - 43,
            7,
            muted,
          ),
        );
      }
      y -= rowHeight + 4;
    });
    y -= 6;
  }

  function addAcceptance() {
    if (!input.acceptance) return;
    addSection(input.acceptance.completed ? "Verbindliche Annahme" : "Annahme des Angebots");
    const acceptance = input.acceptance;
    if (acceptance.completed) {
      const details = [
        acceptance.acceptedName ? `Angenommen durch: ${acceptance.acceptedName}` : "",
        acceptance.acceptedAt ? `Zeitpunkt: ${dateText(acceptance.acceptedAt)} · ${new Date(acceptance.acceptedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr` : "",
        acceptance.versionLabel ? `Bestätigte Version: ${acceptance.versionLabel}` : "",
        acceptance.confirmedGrossTotalCents !== null && acceptance.confirmedGrossTotalCents !== undefined
          ? `Rechnerische Vergleichssumme: ${centsText(acceptance.confirmedGrossTotalCents)} (kein einheitlicher Zahlbetrag)`
          : "",
      ].filter(Boolean);
      const summaryHeight = 28 + details.length * 14;
      ensure(summaryHeight + 8);
      commands.push(rect(margin, y - summaryHeight + 8, contentWidth, summaryHeight, softBlue));
      addParagraph(acceptance.statement, 9.5, slate, 82);
      details.forEach((detail) => addParagraph(detail, 8.5, slate, 82));
      y -= 8;
      if (acceptance.comment) {
        ensure(76);
        addSection("Kommentar zur Annahme");
        addParagraph(acceptance.comment, 8.5, muted, 82);
      }
      if (acceptance.confirmedContentSha256) {
        ensure(70);
        addSection("Digitaler Nachweis");
        addParagraph(`Inhaltsfingerabdruck der bestätigten Version: ${acceptance.confirmedContentSha256}`, 7, muted, 96);
      }
      return;
    }

    addParagraph(acceptance.statement, 9.5, slate);
    ensure(76);
    y -= 12;
    commands.push(line(margin, y, margin + 210, y, muted));
    commands.push(line(margin + 275, y, pageWidth - margin, y, muted));
    commands.push(text("Name", margin, y - 14, 8, muted));
    commands.push(text("Datum / Unterschrift", margin + 275, y - 14, 8, muted));
    y -= 42;
  }

  function addNotes() {
    if (isOfferDocument && input.billingNote) {
      addSection("Abrechnung");
      addParagraph(input.billingNote, 9.5, slate);
    }

    if (isOfferDocument && (input.visibleNote || input.closingText)) {
      addSection("Hinweise zum Leistungsumfang");
      addParagraph(input.visibleNote || input.closingText || "", 9.5, slate);
    }

    if (isOfferDocument && input.paymentTerms) {
      addSection("Zahlungsbedingungen");
      addParagraph(input.paymentTerms, 9.5, slate);
    }

    if (isOfferDocument && input.contractTerms) {
      addSection("Vertragsbedingungen");
      addParagraph(input.contractTerms, 9.5, slate);
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

    if (input.kind === "invoice" && issuer) {
      ensure(155);
      addSection("Zahlung und Rechnungsaussteller");
      if (input.dueDate) addParagraph(`Zahlbar bis ${dateText(input.dueDate)}.`, 9.5, slate);
      addParagraph(`Bankverbindung: ${issuer.bankName} · IBAN ${issuer.iban} · BIC ${issuer.bic}`, 9.5, slate);
      addParagraph(`${issuer.legalName} · ${issuer.address}`, 9.5, slate);
      const taxDetails = [
        issuer.taxNumber ? `Steuernummer: ${issuer.taxNumber}` : "",
        issuer.vatId ? `USt-IdNr.: ${issuer.vatId}` : "",
      ].filter(Boolean).join(" · ");
      if (taxDetails) addParagraph(taxDetails, 9.5, slate);
      const companyDetails = [
        issuer.commercialRegister,
        issuer.managingDirector ? `Geschäftsführung: ${issuer.managingDirector}` : "",
      ].filter(Boolean).join(" · ");
      if (companyDetails) addParagraph(companyDetails, 9.5, slate);
    }

    if (isOfferDocument && issuer) {
      ensure(155);
      addSection("Anbieter- und Unternehmensdaten");
      addParagraph(`${issuer.legalName} · ${issuer.address}`, 9.5, slate);
      const taxDetails = [
        issuer.taxNumber ? `Steuernummer: ${issuer.taxNumber}` : "",
        issuer.vatId ? `USt-IdNr.: ${issuer.vatId}` : "",
      ].filter(Boolean).join(" · ");
      if (taxDetails) addParagraph(taxDetails, 9.5, slate);
      const companyDetails = [
        issuer.commercialRegister,
        issuer.managingDirector ? `Geschäftsführung: ${issuer.managingDirector}` : "",
      ].filter(Boolean).join(" · ");
      if (companyDetails) addParagraph(companyDetails, 9.5, slate);
      addParagraph(`Bankverbindung: ${issuer.bankName} · IBAN ${issuer.iban} · BIC ${issuer.bic}`, 9.5, slate);
    }

    if (input.kind === "offer") {
      addAcceptance();
      addSection("Hinweis zum Angebot");
      addParagraph(
        "Dieses Angebot wurde auf Grundlage der bekannten Objekt- und Leistungsdaten erstellt. Änderungen am Leistungsumfang, zusätzliche Sonderleistungen oder saisonale Aufgaben können separat kalkuliert werden.",
        9.5,
        slate,
      );
      addParagraph(
        "Reparaturen, Instandsetzungen und größere Handwerksleistungen sind nur enthalten, wenn sie ausdrücklich als Position aufgeführt sind.",
        9.5,
        slate,
      );
    } else if (input.kind === "offer_acceptance") {
      addAcceptance();
    } else {
      addSection("Hinweis zur Rechnung");
      addParagraph(
        "Bitte begleichen Sie die Rechnung zum angegebenen Fälligkeitsdatum. Bei Rückfragen zum Leistungsumfang oder zum Abrechnungszeitraum melden Sie sich bitte direkt bei Hausvia.",
        9.5,
        slate,
      );
      addParagraph(
        "Reparaturen, Instandsetzungen und größere Handwerksleistungen sind nur enthalten, wenn sie ausdrücklich als Position aufgeführt sind.",
        9.5,
        slate,
      );
    }
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
  addMetadataOverflow();
  addItems();
  addDiscounts();
  if (!input.hidePricingSummary) addBillingBuckets();
  addNotes();

  pages.forEach((pageCommands, index) => {
    pageCommands.push(text(`Seite ${index + 1} von ${pages.length}`, 500, 28, 7, muted));
  });

  return createPdf(pages);
}
