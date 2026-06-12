import { SITE } from "@/lib/site";

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
}: {
  to: string;
  subject: string;
  headline: string;
  intro: string;
  note: string;
  attachment: MailAttachment;
  replyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f7f9fc;padding:24px;color:#172033">
      <div style="max-width:660px;margin:0 auto;background:#ffffff;border:1px solid #dfe7f2;border-radius:12px;overflow:hidden">
        <div style="background:#082b61;color:#ffffff;padding:24px 28px">
          <div style="font-size:24px;font-weight:800">Hausvia</div>
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d8e4f5">Hausmeisterservice</div>
        </div>
        <div style="border-top:6px solid #f5c542;padding:28px">
          <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">${headline}</h1>
          <p style="font-size:15px;line-height:1.65;margin:0 0 18px">${intro}</p>
          <p style="font-size:14px;line-height:1.6;margin:0;color:#526071">${note}</p>
          <p style="font-size:14px;line-height:1.6;margin:22px 0 0;color:#526071">
            Das Dokument ist zusätzlich im Hausvia Portal hinterlegt.
          </p>
        </div>
      </div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to,
      subject,
      html,
      text: `${headline}\n\n${intro}\n\n${note}\n\nDas Dokument befindet sich im Anhang und zusätzlich im Hausvia Portal.`,
      reply_to: replyTo,
      attachments: [attachment],
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend failed with status ${response.status}: ${responseText}`);
  }
}
