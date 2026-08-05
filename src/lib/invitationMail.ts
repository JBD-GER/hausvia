import "server-only";

import { renderHausviaEmail } from "@/lib/hausviaEmail";
import { SITE } from "@/lib/site";

const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? `Hausvia <${SITE.email}>`;

export async function sendInvitationEmail({
  to,
  recipientName,
  invitationLink,
  idempotencyKey,
}: {
  to: string;
  recipientName: string;
  invitationLink: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const rendered = renderHausviaEmail({
    preheader: "Ihre Einladung zum Hausvia Portal",
    eyebrow: "Portal-Einladung",
    headline: "Willkommen im Hausvia Portal",
    intro: `Guten Tag ${recipientName || ""}, Sie wurden zum Hausvia Portal eingeladen. Über den folgenden Button legen Sie Ihr persönliches Passwort fest und aktivieren Ihren Zugang.`,
    note: "Der Link ist 30 Tage gültig und kann nur einmal verwendet werden. Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail bitte.",
    action: {
      label: "Einladung annehmen",
      href: invitationLink,
    },
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to,
      subject: "Ihre Einladung zum Hausvia Portal",
      html: rendered.html,
      text: rendered.text,
      reply_to: SITE.email,
    }),
  });

  if (!response.ok) {
    throw new Error(`Invitation email failed with status ${response.status}`);
  }
}
