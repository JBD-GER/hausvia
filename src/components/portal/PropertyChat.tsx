/* eslint-disable @next/next/no-img-element */
import { CheckCheck, FileText, Paperclip } from "lucide-react";
import {
  markPropertyMessagesReadAction,
  reactToPropertyMessageAction,
} from "@/app/actions/portalChat";
import {
  EmptyState,
  Field,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import { formatGermanDate } from "@/lib/portal/core";

const ALLOWED_REACTIONS = ["👍", "✅", "❤️", "🙂", "❄️", "🛠️"] as const;
const CHAT_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,application/pdf";

type MessageAttachment = {
  id: string;
  filename: string;
  mime_type: string;
};

type MessageReaction = {
  emoji: string;
  user_id: string;
};

type MessageRead = {
  user_id: string;
  read_at?: string | null;
};

export type PropertyChatMessage = {
  id: string;
  body: string;
  message_type: string;
  created_at: string;
  sender_id: string | null;
  sender_display_name: string | null;
  message_attachments?: MessageAttachment[] | null;
  message_reactions?: MessageReaction[] | null;
  message_reads?: MessageRead[] | null;
};

type SendMessageAction = (formData: FormData) => Promise<void>;

function Attachment({
  attachment,
  url,
}: {
  attachment: MessageAttachment;
  url?: string;
}) {
  if (!url) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-bold text-slate-500">
        <Paperclip aria-hidden="true" size={16} />
        {attachment.filename} · derzeit nicht verfügbar
      </p>
    );
  }

  if (attachment.mime_type.startsWith("image/")) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block w-fit max-w-full"
      >
        <img
          src={url}
          alt={attachment.filename}
          loading="lazy"
          className="max-h-72 max-w-full rounded-xl border border-slate-200 bg-white object-contain"
        />
      </a>
    );
  }

  if (attachment.mime_type.startsWith("video/")) {
    return (
      <video
        controls
        preload="metadata"
        className="mt-3 max-h-72 w-full rounded-xl border border-slate-200 bg-black"
      >
        <source src={url} type={attachment.mime_type} />
        Ihr Browser kann dieses Video nicht wiedergeben.
      </video>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-brand hover:border-brand"
    >
      <FileText aria-hidden="true" size={18} />
      {attachment.filename}
    </a>
  );
}

export function PropertyChat({
  propertyId,
  currentUserId,
  messages,
  signedAttachmentUrls,
  sendMessageAction,
  readOnly = false,
}: {
  propertyId: string;
  currentUserId: string;
  messages: PropertyChatMessage[];
  signedAttachmentUrls: Record<string, string>;
  sendMessageAction: SendMessageAction;
  readOnly?: boolean;
}) {
  const unreadCount = messages.filter(
    (message) =>
      message.sender_id !== currentUserId &&
      !message.message_reads?.some((read) => read.user_id === currentUserId),
  ).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-500" aria-live="polite">
          {unreadCount
            ? `${unreadCount} ungelesene ${unreadCount === 1 ? "Nachricht" : "Nachrichten"}`
            : "Alle angezeigten Nachrichten sind gelesen."}
        </p>
        {unreadCount && !readOnly ? (
          <form action={markPropertyMessagesReadAction}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:border-brand hover:text-brand">
              <CheckCheck aria-hidden="true" size={17} />
              Als gelesen markieren
            </button>
          </form>
        ) : null}
      </div>

      <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {messages.length ? (
          messages.map((message) => {
            const reactionCounts = new Map<string, number>();
            for (const reaction of message.message_reactions ?? []) {
              reactionCounts.set(
                reaction.emoji,
                (reactionCounts.get(reaction.emoji) ?? 0) + 1,
              );
            }

            return (
              <article
                key={message.id}
                className={`rounded-xl border p-3 ${
                  message.message_type === "system"
                    ? "border-blue-200 bg-blue-50"
                    : message.sender_id === currentUserId
                      ? "border-brand/20 bg-brand-soft/40"
                      : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500">
                  <span>
                    {message.message_type === "system"
                      ? "Hausvia System"
                      : message.sender_id === currentUserId
                        ? "Sie"
                        : message.sender_display_name || "Teilnehmer"}
                  </span>
                  <time dateTime={message.created_at}>
                    {formatGermanDate(message.created_at, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {message.body}
                </p>

                {message.message_attachments?.map((attachment) => (
                  <Attachment
                    key={attachment.id}
                    attachment={attachment}
                    url={signedAttachmentUrls[attachment.id]}
                  />
                ))}

                {!readOnly ? (
                  <div
                    className="mt-3 flex flex-wrap gap-1.5"
                    aria-label="Auf Nachricht reagieren"
                  >
                  {ALLOWED_REACTIONS.map((emoji) => {
                    const selected = message.message_reactions?.some(
                      (reaction) =>
                        reaction.user_id === currentUserId &&
                        reaction.emoji === emoji,
                    );
                    const count = reactionCounts.get(emoji) ?? 0;
                    return (
                      <form key={emoji} action={reactToPropertyMessageAction}>
                        <input
                          type="hidden"
                          name="propertyId"
                          value={propertyId}
                        />
                        <input
                          type="hidden"
                          name="messageId"
                          value={message.id}
                        />
                        <input type="hidden" name="emoji" value={emoji} />
                        <button
                          aria-label={`${emoji} ${selected ? "entfernen" : "hinzufügen"}${count ? `, ${count} Reaktionen` : ""}`}
                          aria-pressed={selected}
                          className={`inline-flex min-h-9 min-w-10 items-center justify-center gap-1 rounded-full border px-2 text-sm font-bold transition ${
                            selected
                              ? "border-brand bg-brand text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-brand hover:bg-brand-soft"
                          }`}
                        >
                          <span aria-hidden="true">{emoji}</span>
                          {count ? (
                            <span className="text-xs">{count}</span>
                          ) : null}
                        </button>
                      </form>
                    );
                  })}
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <EmptyState
            title="Noch keine Nachrichten"
            text="Schreiben Sie die erste Nachricht zur Immobilie."
          />
        )}
      </div>

      {readOnly ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Der Chat dieser archivierten Immobilie ist schreibgeschützt.
        </p>
      ) : (
        <form
          action={sendMessageAction}
          encType="multipart/form-data"
          className="mt-4 grid gap-3 border-t border-slate-200 pt-4"
        >
        <input type="hidden" name="propertyId" value={propertyId} />
        <Field label="Nachricht">
          <textarea
            name="body"
            required
            maxLength={4000}
            rows={3}
            className={inputClass}
            placeholder="Nachricht schreiben – Emojis sind möglich 🙂"
          />
        </Field>
        <Field label="Bild, Video oder PDF (optional)">
          <input
            name="attachment"
            type="file"
            accept={CHAT_ATTACHMENT_ACCEPT}
            className={inputClass}
          />
        </Field>
        <p className="text-xs leading-5 text-slate-500">
          Erlaubt: JPG, PNG, WebP, HEIC, MP4, MOV, WebM und PDF · maximal 4 MB.
        </p>
        <button className={buttonClass}>Nachricht senden</button>
        </form>
      )}
    </>
  );
}
