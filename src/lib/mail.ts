import { SITE } from "@/lib/site";
import {
  renderHausviaEmail,
  type HausviaEmailAction,
  type HausviaEmailFooter,
} from "@/lib/hausviaEmail";

const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? `Hausvia <${SITE.email}>`;

export type MailAttachment = {
  filename: string;
  content: string;
};

export async function sendPortalDocumentEmail({
  to,
  subject,
  headline,
  intro,
  note,
  attachment,
  replyTo = SITE.email,
  fromEmail,
  idempotencyKey,
  action,
  footer,
}: {
  to: string;
  subject: string;
  headline: string;
  intro: string;
  note: string;
  attachment: MailAttachment;
  replyTo?: string;
  fromEmail?: string;
  idempotencyKey?: string;
  action?: HausviaEmailAction | null;
  footer?: HausviaEmailFooter;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const portalUrl = `${SITE.url}/portal`;
  const renderedEmail = renderHausviaEmail({
    preheader: `${headline} – Ihr Dokument von Hausvia`,
    eyebrow: "Ihr Hausvia Dokument",
    headline,
    intro,
    note,
    attachment: {
      filename: attachment.filename,
      portalUrl,
      description: "Das PDF befindet sich im Anhang und ist zusätzlich sicher im Hausvia Portal hinterlegt.",
    },
    action:
      action === null
        ? undefined
        : action ?? {
            label: "Im Hausvia Portal öffnen",
            href: portalUrl,
          },
    footer,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: fromEmail || resendFromEmail,
      to,
      subject,
      html: renderedEmail.html,
      text: renderedEmail.text,
      reply_to: replyTo,
      attachments: [attachment],
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend failed with status ${response.status}: ${responseText}`);
  }
}
