"use client";

/* eslint-disable @next/next/no-img-element */
import {
  CheckCheck,
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useRef,
  useState,
} from "react";
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
import {
  INITIAL_PROPERTY_MESSAGE_ACTION_STATE,
  propertyMessageActionError,
  type SendPropertyMessageAction,
} from "@/lib/portal/chatActionState";
import { optimizeChatImage } from "@/lib/portal/chatImageCompression";
import { formatGermanDate } from "@/lib/portal/core";
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_FILE_BYTES,
  validateChatAttachmentSelection,
  validateUploadMetadata,
} from "@/lib/portal/uploadPolicy";

const ALLOWED_REACTIONS = ["👍", "✅", "❤️", "🙂", "❄️", "🛠️"] as const;

function megabytes(bytes: number) {
  return (bytes / 1024 / 1024).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

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
  sendMessageAction: SendPropertyMessageAction;
  readOnly?: boolean;
}) {
  const messageFormRef = useRef<HTMLFormElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentSelectionId = useRef(0);
  const [preparedAttachment, setPreparedAttachment] = useState<File | null>(
    null,
  );
  const [attachmentOptimizing, setAttachmentOptimizing] = useState(false);
  const [attachmentFeedback, setAttachmentFeedback] = useState<{
    tone: "info" | "error";
    message: string;
  } | null>(null);
  const submitPreparedMessage = useCallback(
    async (previousState: typeof INITIAL_PROPERTY_MESSAGE_ACTION_STATE, formData: FormData) => {
      const rawAttachment = formData.get("attachment");
      const attachment =
        preparedAttachment ??
        (rawAttachment instanceof File && rawAttachment.size > 0
          ? rawAttachment
          : null);
      if (attachment) {
        const validation = validateUploadMetadata(attachment, "chat");
        if (!validation.ok) {
          return propertyMessageActionError(previousState, validation.message);
        }
        formData.set("attachment", attachment);
      } else {
        formData.delete("attachment");
      }
      const result = await sendMessageAction(previousState, formData);
      if (result.status === "success") {
        messageFormRef.current?.reset();
        setPreparedAttachment(null);
        setAttachmentFeedback(null);
      }
      return result;
    },
    [preparedAttachment, sendMessageAction],
  );
  const [sendState, sendFormAction, sendPending] = useActionState(
    submitPreparedMessage,
    INITIAL_PROPERTY_MESSAGE_ACTION_STATE,
  );

  async function prepareAttachment(file: File | null) {
    const selectionId = attachmentSelectionId.current + 1;
    attachmentSelectionId.current = selectionId;
    setPreparedAttachment(null);
    setAttachmentFeedback(null);
    setAttachmentOptimizing(false);
    if (!file) return;

    const selection = validateChatAttachmentSelection(file);
    if (!selection.ok) {
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      setAttachmentFeedback({ tone: "error", message: selection.message });
      return;
    }
    if (!selection.optimizeImage) {
      setPreparedAttachment(file);
      setAttachmentFeedback({
        tone: "info",
        message: `${file.name} · ${megabytes(file.size)} MB bereit zum Senden.`,
      });
      return;
    }

    setAttachmentOptimizing(true);
    setAttachmentFeedback({
      tone: "info",
      message: `Das Foto (${megabytes(file.size)} MB) wird automatisch für den Chat optimiert …`,
    });
    try {
      const optimized = await optimizeChatImage(file);
      if (attachmentSelectionId.current !== selectionId) return;
      const validation = validateUploadMetadata(optimized, "chat");
      if (!validation.ok) throw new Error(validation.message);
      setPreparedAttachment(optimized);
      setAttachmentFeedback({
        tone: "info",
        message: `Foto optimiert: ${megabytes(file.size)} MB → ${megabytes(optimized.size)} MB.`,
      });
    } catch (error) {
      if (attachmentSelectionId.current !== selectionId) return;
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      setPreparedAttachment(null);
      setAttachmentFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Das Foto konnte nicht optimiert werden.",
      });
    } finally {
      if (attachmentSelectionId.current === selectionId) {
        setAttachmentOptimizing(false);
      }
    }
  }

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
          ref={messageFormRef}
          action={sendFormAction}
          aria-busy={sendPending || attachmentOptimizing}
          onSubmit={(event) => {
            if (attachmentOptimizing) {
              event.preventDefault();
              setAttachmentFeedback({
                tone: "info",
                message: "Bitte warten Sie kurz, bis das Foto optimiert wurde.",
              });
              return;
            }
            const selectedFile =
              preparedAttachment ?? attachmentInputRef.current?.files?.[0];
            if (selectedFile && selectedFile.size > 0) {
              const validation = validateUploadMetadata(selectedFile, "chat");
              if (!validation.ok) {
                event.preventDefault();
                setAttachmentFeedback({
                  tone: "error",
                  message: validation.message,
                });
              }
            }
          }}
          className="mt-4 grid gap-3 border-t border-slate-200 pt-4"
        >
          <input type="hidden" name="propertyId" value={propertyId} />

          {sendState.status !== "idle" && !sendPending ? (
            <div
              id="chat-submit-feedback"
              role={sendState.status === "error" ? "alert" : "status"}
              aria-live={sendState.status === "error" ? "assertive" : "polite"}
              aria-atomic="true"
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-bold ${
                sendState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {sendState.status === "error" ? (
                <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
              ) : (
                <CircleCheck aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
              )}
              <span>{sendState.message}</span>
            </div>
          ) : null}

          <fieldset
            disabled={sendPending || attachmentOptimizing}
            className="m-0 grid min-w-0 gap-3 border-0 p-0"
          >
            <Field label="Nachricht" required>
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
                ref={attachmentInputRef}
                name="attachment"
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                aria-describedby="chat-upload-hint chat-attachment-feedback"
                onChange={(event) => {
                  void prepareAttachment(event.currentTarget.files?.[0] ?? null);
                }}
                className={inputClass}
              />
            </Field>
            {attachmentFeedback ? (
              <p
                id="chat-attachment-feedback"
                role={attachmentFeedback.tone === "error" ? "alert" : "status"}
                className={`rounded-lg border px-3 py-2 text-xs font-bold leading-5 ${
                  attachmentFeedback.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-teal-200 bg-teal-50 text-teal-900"
                }`}
              >
                {attachmentFeedback.message}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p id="chat-upload-hint" className="text-xs leading-5 text-slate-500">
                Fotos bis 30 MB werden automatisch optimiert. Videos und PDFs
                dürfen maximal {Math.round(MAX_CHAT_FILE_BYTES / 1024 / 1024)} MB groß sein.
              </p>
              <button
                type="submit"
                disabled={sendPending || attachmentOptimizing}
                className={`${buttonClass} shrink-0 sm:min-w-44`}
              >
                {sendPending || attachmentOptimizing ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
                ) : (
                  <Send aria-hidden="true" size={18} />
                )}
                {attachmentOptimizing
                  ? "Foto wird optimiert …"
                  : sendPending
                    ? "Wird gesendet …"
                    : "Nachricht senden"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}
