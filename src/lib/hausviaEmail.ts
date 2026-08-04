import { SITE } from "@/lib/site";

export type HausviaEmailAction = {
  label: string;
  href: string;
};

export type HausviaEmailAttachment = {
  filename: string;
  portalUrl?: string;
  description?: string;
};

export type HausviaEmailSummary = {
  title?: string;
  rows: Array<{
    label: string;
    value: string;
  }>;
};

export type HausviaEmailContent = {
  preheader?: string;
  eyebrow?: string;
  headline: string;
  intro: string;
  note?: string;
  summary?: HausviaEmailSummary;
  attachment?: HausviaEmailAttachment;
  action?: HausviaEmailAction;
};

export type RenderedHausviaEmail = {
  html: string;
  text: string;
};

export function escapeHausviaEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function normalizePlainText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlText(value: string) {
  return escapeHausviaEmailHtml(normalizePlainText(value)).replace(/\n/g, "<br />");
}

function safeWebUrl(value: string | undefined) {
  if (!value) return "";

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function renderHausviaPlainText(content: HausviaEmailContent) {
  const headline = normalizePlainText(content.headline);
  const intro = normalizePlainText(content.intro);
  const note = content.note ? normalizePlainText(content.note) : "";
  const portalUrl = safeWebUrl(content.attachment?.portalUrl);
  const actionUrl = safeWebUrl(content.action?.href);
  const sections = ["HAUSVIA", "Hausmeisterservice", "", headline, "", intro];

  if (note) sections.push("", note);

  if (content.summary?.rows.length) {
    sections.push("", normalizePlainText(content.summary.title || "Übersicht"));
    for (const row of content.summary.rows) {
      sections.push(`${normalizePlainText(row.label)}: ${normalizePlainText(row.value)}`);
    }
  }

  if (content.attachment) {
    sections.push(
      "",
      "DOKUMENT",
      normalizePlainText(content.attachment.filename),
      normalizePlainText(
        content.attachment.description ??
          "Das Dokument befindet sich im Anhang und ist zusätzlich im Hausvia Portal hinterlegt.",
      ),
    );
    if (portalUrl) sections.push(`Portal: ${portalUrl}`);
  }

  if (content.action && actionUrl) {
    sections.push("", `${normalizePlainText(content.action.label)}: ${actionUrl}`);
  }

  sections.push(
    "",
    "Fragen zu Ihrem Dokument? Antworten Sie einfach auf diese E-Mail oder kontaktieren Sie uns:",
    `${SITE.phone} · ${SITE.email}`,
    "",
    SITE.legalName,
    SITE.address,
    `Vertreten durch ${SITE.representative} · ${SITE.register} · USt-IdNr. ${SITE.vatId}`,
    `Impressum: ${SITE.url}/impressum`,
    `Datenschutz: ${SITE.url}/datenschutz`,
  );

  return `${sections.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function renderHausviaEmail(content: HausviaEmailContent): RenderedHausviaEmail {
  const preheader = htmlText(content.preheader || content.headline);
  const eyebrow = htmlText(content.eyebrow || "Hausvia Dokumentenservice");
  const headline = htmlText(content.headline);
  const intro = htmlText(content.intro);
  const note = content.note ? htmlText(content.note) : "";
  const attachmentName = content.attachment ? htmlText(content.attachment.filename) : "";
  const attachmentDescription = content.attachment
    ? htmlText(
        content.attachment.description ??
          "Das PDF befindet sich im Anhang und ist zusätzlich sicher im Hausvia Portal hinterlegt.",
      )
    : "";
  const portalUrl = safeWebUrl(content.attachment?.portalUrl);
  const actionUrl = safeWebUrl(content.action?.href);
  const actionLabel = content.action && actionUrl ? htmlText(content.action.label) : "";
  const escapedPortalUrl = portalUrl ? escapeHausviaEmailHtml(portalUrl) : "";
  const escapedActionUrl = actionUrl ? escapeHausviaEmailHtml(actionUrl) : "";
  const escapedPhone = escapeHausviaEmailHtml(SITE.phone);
  const escapedEmail = escapeHausviaEmailHtml(SITE.email);
  const escapedLegalName = escapeHausviaEmailHtml(SITE.legalName);
  const escapedAddress = escapeHausviaEmailHtml(SITE.address);
  const escapedRepresentative = escapeHausviaEmailHtml(SITE.representative);
  const escapedRegister = escapeHausviaEmailHtml(SITE.register);
  const escapedVatId = escapeHausviaEmailHtml(SITE.vatId);
  const phoneHref = escapeHausviaEmailHtml(`tel:${SITE.phone.replace(/[^+\d]/g, "")}`);
  const emailHref = escapeHausviaEmailHtml(`mailto:${SITE.email}`);
  const imprintUrl = escapeHausviaEmailHtml(`${SITE.url}/impressum`);
  const privacyUrl = escapeHausviaEmailHtml(`${SITE.url}/datenschutz`);
  const year = new Date().getFullYear();

  const summaryBlock = content.summary?.rows.length
    ? `
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:24px 0 0;border-collapse:separate;background:#f8fafc;border:1px solid #dbe4ef;border-radius:12px;overflow:hidden;">
                              <tr>
                                <td colspan="2" style="padding:15px 18px;background:#edf3fa;color:#082b61;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;line-height:17px;letter-spacing:1.2px;text-transform:uppercase;">${htmlText(content.summary.title || "Ihre Übersicht")}</td>
                              </tr>
                              ${content.summary.rows
                                .map(
                                  (row, index) => `<tr>
                                <td valign="top" style="width:38%;padding:12px 10px 12px 18px;${index > 0 ? "border-top:1px solid #e5ebf3;" : ""}color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:19px;">${htmlText(row.label)}</td>
                                <td valign="top" style="padding:12px 18px 12px 10px;${index > 0 ? "border-top:1px solid #e5ebf3;" : ""}color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:20px;">${htmlText(row.value)}</td>
                              </tr>`,
                                )
                                .join("")}
                            </table>`
    : "";

  const attachmentBlock = content.attachment
    ? `
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:24px 0 0;border-collapse:separate;background:#f3f7fc;border:1px solid #d8e3f0;border-radius:12px;">
                              <tr>
                                <td width="58" valign="top" style="width:58px;padding:18px 0 18px 18px;">
                                  <table role="presentation" width="42" cellspacing="0" cellpadding="0" border="0" style="width:42px;border-collapse:collapse;">
                                    <tr>
                                      <td align="center" style="height:42px;background:#082b61;border-radius:8px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.8px;">PDF</td>
                                    </tr>
                                  </table>
                                </td>
                                <td valign="top" style="padding:18px 18px 18px 14px;font-family:Arial,Helvetica,sans-serif;">
                                  <p style="margin:0;color:#082b61;font-size:11px;font-weight:800;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;">Dokument im Anhang</p>
                                  <p style="margin:3px 0 0;color:#172033;font-size:15px;font-weight:700;line-height:22px;word-break:break-word;">${attachmentName}</p>
                                  <p style="margin:7px 0 0;color:#526071;font-size:13px;line-height:20px;">${attachmentDescription}</p>
                                  ${
                                    escapedPortalUrl
                                      ? `<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;"><a href="${escapedPortalUrl}" style="color:#082b61;font-weight:700;text-decoration:underline;">Im Hausvia Portal verfügbar</a></p>`
                                      : ""
                                  }
                                </td>
                              </tr>
                            </table>`
    : "";

  const actionBlock =
    content.action && escapedActionUrl
      ? `
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 0;border-collapse:separate;">
                              <tr>
                                <td class="cta-cell" align="center" bgcolor="#082b61" style="border-radius:8px;background:#082b61;">
                                  <a class="cta-link" href="${escapedActionUrl}" style="display:inline-block;padding:14px 22px;border:1px solid #082b61;border-radius:8px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800;line-height:18px;text-decoration:none;">${actionLabel}</a>
                                </td>
                              </tr>
                            </table>`
      : "";

  const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${headline}</title>
    <style>
      body { margin: 0 !important; padding: 0 !important; background: #f3f6fa; }
      table { border-spacing: 0; }
      img { border: 0; display: block; }
      a { color: #082b61; }
      @media only screen and (max-width: 680px) {
        .email-shell { width: 100% !important; }
        .mobile-gutter { padding-left: 12px !important; padding-right: 12px !important; }
        .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .mobile-title { font-size: 26px !important; line-height: 32px !important; }
        .cta-cell, .cta-link { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fa;color:#172033;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#f3f6fa;">
      <tr>
        <td class="mobile-gutter" align="center" style="padding:28px 20px;">
          <!--[if mso]><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
          <table class="email-shell" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #dbe4ef;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(8,43,97,0.08);">
            <tr>
              <td style="height:6px;background:#f5c542;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:27px 34px;background:#082b61;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="middle">
                      <p style="margin:0;color:#ffffff;font-size:27px;font-weight:800;line-height:31px;letter-spacing:-0.4px;">Hausvia</p>
                      <p style="margin:3px 0 0;color:#d8e4f5;font-size:10px;font-weight:700;line-height:15px;letter-spacing:2px;text-transform:uppercase;">Hausmeisterservice</p>
                    </td>
                    <td align="right" valign="middle" style="color:#f5c542;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;line-height:18px;letter-spacing:0.7px;text-transform:uppercase;">Digital &amp; zuverlässig</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:34px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td>
                      <p style="margin:0;color:#0b4b91;font-size:11px;font-weight:800;line-height:17px;letter-spacing:1.5px;text-transform:uppercase;">${eyebrow}</p>
                      <h1 class="mobile-title" style="margin:8px 0 0;color:#101828;font-size:31px;font-weight:800;line-height:38px;letter-spacing:-0.6px;">${headline}</h1>
                      <table role="presentation" width="52" cellspacing="0" cellpadding="0" border="0" style="width:52px;margin:18px 0;border-collapse:collapse;">
                        <tr><td style="height:4px;background:#f5c542;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr>
                      </table>
                      <p style="margin:0;color:#344054;font-size:15px;line-height:25px;">${intro}</p>
                      ${summaryBlock}
                      ${
                        note
                          ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:22px 0 0;border-collapse:separate;background:#fff9e8;border-left:4px solid #f5c542;border-radius:8px;"><tr><td style="padding:15px 16px;color:#4b3a05;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;">${note}</td></tr></table>`
                          : ""
                      }
                      ${attachmentBlock}
                      ${actionBlock}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:24px 34px;background:#edf3fa;border-top:1px solid #d8e3f0;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0;color:#172033;font-size:13px;font-weight:800;line-height:20px;">Fragen zu Ihrem Dokument?</p>
                <p style="margin:4px 0 0;color:#526071;font-size:13px;line-height:21px;">Antworten Sie einfach auf diese E-Mail oder erreichen Sie uns unter <a href="${phoneHref}" style="color:#082b61;font-weight:700;text-decoration:none;">${escapedPhone}</a> und <a href="${emailHref}" style="color:#082b61;font-weight:700;text-decoration:none;">${escapedEmail}</a>.</p>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="padding:25px 34px;background:#061f47;font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0;color:#ffffff;font-size:13px;font-weight:800;line-height:20px;">${escapedLegalName}</p>
                <p style="margin:4px 0 0;color:#b8c9df;font-size:11px;line-height:18px;">${escapedAddress}<br />Vertreten durch ${escapedRepresentative} · ${escapedRegister}<br />USt-IdNr. ${escapedVatId}</p>
                <p style="margin:12px 0 0;color:#b8c9df;font-size:11px;line-height:18px;">© ${year} Hausvia · <a href="${imprintUrl}" style="color:#f5c542;text-decoration:underline;">Impressum</a> · <a href="${privacyUrl}" style="color:#f5c542;text-decoration:underline;">Datenschutz</a></p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    html,
    text: renderHausviaPlainText(content),
  };
}
