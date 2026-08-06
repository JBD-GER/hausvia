"use client";

/* eslint-disable @next/next/no-img-element */
import {
  CheckCheck,
  CircleAlert,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  SmilePlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  markPropertyMessagesReadAction,
  reactToPropertyMessageAction,
} from "@/app/actions/portalChat";
import {
  INITIAL_PROPERTY_MESSAGE_ACTION_STATE,
  propertyMessageActionError,
  type SendPropertyMessageAction,
} from "@/lib/portal/chatActionState";
import { optimizeChatImage } from "@/lib/portal/chatImageCompression";
import {
  chatCalendarDay,
  chatInitials,
  chatMessageTime,
  chatRoleLabel,
  chatSenderName,
} from "@/lib/portal/chatPresentation";
import { formatGermanDate } from "@/lib/portal/core";
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_FILE_BYTES,
  validateChatAttachmentSelection,
  validateUploadMetadata,
} from "@/lib/portal/uploadPolicy";
import type { AppRole } from "@/lib/supabase/types";

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
  sender_role?: AppRole | null;
  message_attachments?: MessageAttachment[] | null;
  message_reactions?: MessageReaction[] | null;
  message_reads?: MessageRead[] | null;
};

const roleBadgeClasses: Record<AppRole, string> = {
  admin: "border-brand/15 bg-brand text-white",
  employee: "border-[#08AEB4]/25 bg-[#DDF7F6] text-[#056C71]",
  customer: "border-[#F5C542]/45 bg-[#FFF5C7] text-[#715500]",
};

const roleAvatarClasses: Record<AppRole, string> = {
  admin: "bg-brand text-white",
  employee: "bg-[#08AEB4] text-white",
  customer: "bg-[#F5C542] text-brand",
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

function ReactionPicker({
  propertyId,
  message,
  currentUserId,
  align,
}: {
  propertyId: string;
  message: PropertyChatMessage;
  currentUserId: string;
  align: "left" | "right";
}) {
  return (
    <details className="group/reactions relative shrink-0">
      <summary
        aria-label="Auf Nachricht reagieren"
        className="grid size-9 cursor-pointer list-none place-items-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-100 shadow-sm transition hover:border-brand/30 hover:bg-brand-soft hover:text-brand sm:opacity-0 sm:group-hover:opacity-100 [&::-webkit-details-marker]:hidden"
      >
        <SmilePlus aria-hidden="true" size={17} />
      </summary>
      <div
        className={`absolute bottom-11 z-20 flex gap-1 rounded-full border border-slate-200 bg-white p-1.5 shadow-[0_14px_35px_rgba(8,43,97,0.18)] ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {ALLOWED_REACTIONS.map((emoji) => {
          const selected = message.message_reactions?.some(
            (reaction) =>
              reaction.user_id === currentUserId && reaction.emoji === emoji,
          );
          return (
            <form key={emoji} action={reactToPropertyMessageAction}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="messageId" value={message.id} />
              <input type="hidden" name="emoji" value={emoji} />
              <button
                aria-label={`${emoji} ${selected ? "entfernen" : "hinzufügen"}`}
                aria-pressed={selected}
                className={`grid size-9 place-items-center rounded-full text-base transition hover:bg-brand-soft ${
                  selected ? "bg-brand text-white" : "bg-white text-slate-800"
                }`}
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            </form>
          );
        })}
      </div>
    </details>
  );
}

export function PropertyChat({
  propertyId,
  propertyName,
  currentUserId,
  currentUserRole,
  messages,
  signedAttachmentUrls,
  sendMessageAction,
  readOnly = false,
}: {
  propertyId: string;
  propertyName: string;
  currentUserId: string;
  currentUserRole: AppRole;
  messages: PropertyChatMessage[];
  signedAttachmentUrls: Record<string, string>;
  sendMessageAction: SendPropertyMessageAction;
  readOnly?: boolean;
}) {
  const messageFormRef = useRef<HTMLFormElement>(null);
  const messageViewportRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: messages.length > 1 ? "smooth" : "auto",
    });
  }, [messages.length]);

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

  function clearAttachment() {
    attachmentSelectionId.current += 1;
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    setPreparedAttachment(null);
    setAttachmentOptimizing(false);
    setAttachmentFeedback(null);
  }

  const unreadCount = messages.filter(
    (message) =>
      message.sender_id !== currentUserId &&
      !message.message_reads?.some((read) => read.user_id === currentUserId),
  ).length;

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(8,43,97,0.09)]">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3.5 py-3 sm:px-5 sm:py-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-sm font-black text-white ring-4 ring-brand-soft sm:size-12">
          <UsersRound aria-hidden="true" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black tracking-[-0.015em] text-slate-950 sm:text-base">
            {propertyName} · Gruppenchat
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[0.68rem] font-bold text-slate-500 sm:text-xs">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" />
            Live · Hausvia · Mitarbeiter · Kunde
          </p>
        </div>
        <div className="shrink-0">
          {unreadCount && !readOnly ? (
            <form action={markPropertyMessagesReadAction}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <button className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-brand/15 bg-brand-soft px-3 text-[0.68rem] font-black text-brand transition hover:bg-brand hover:text-white sm:text-xs">
                <CheckCheck aria-hidden="true" size={16} />
                <span className="hidden sm:inline">{unreadCount} als gelesen markieren</span>
                <span className="sm:hidden">{unreadCount}</span>
              </button>
            </form>
          ) : (
            <span className="hidden items-center gap-1.5 text-[0.68rem] font-bold text-emerald-700 sm:inline-flex">
              <CheckCheck aria-hidden="true" size={16} /> Gelesen
            </span>
          )}
        </div>
      </header>

      <div
        ref={messageViewportRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Nachrichten im Gruppenchat ${propertyName}`}
        className="h-[min(62dvh,42rem)] min-h-[26rem] overflow-y-auto scroll-smooth bg-[#edf3f5] [background-image:radial-gradient(rgba(8,43,97,0.055)_1px,transparent_1px)] [background-size:18px_18px]"
      >
        <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-end gap-2.5 px-2.5 py-4 sm:px-5 sm:py-6">
          {messages.length ? (
            messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const showDay =
                !previousMessage ||
                chatCalendarDay(previousMessage.created_at) !==
                  chatCalendarDay(message.created_at);
              const isCurrentUser = message.sender_id === currentUserId;
              const senderRole =
                message.sender_role ?? (isCurrentUser ? currentUserRole : null);
              const senderName = chatSenderName({
                displayName: message.sender_display_name,
                role: senderRole,
                isCurrentUser,
              });
              const reactionCounts = new Map<string, number>();
              for (const reaction of message.message_reactions ?? []) {
                reactionCounts.set(
                  reaction.emoji,
                  (reactionCounts.get(reaction.emoji) ?? 0) + 1,
                );
              }

              return (
                <div key={message.id}>
                  {showDay ? (
                    <div className="my-3 flex justify-center first:mt-0">
                      <time
                        dateTime={message.created_at}
                        className="rounded-full border border-white/90 bg-white/90 px-3 py-1 text-[0.65rem] font-extrabold text-slate-500 shadow-sm backdrop-blur"
                      >
                        {formatGermanDate(message.created_at, {
                          weekday: "short",
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                  ) : null}

                  {message.message_type === "system" ? (
                    <div className="flex justify-center py-1">
                      <article className="max-w-[92%] rounded-xl border border-sky-200/80 bg-sky-50/95 px-3 py-2 text-center text-xs font-bold leading-5 text-sky-900 shadow-sm">
                        <span className="mr-1 font-black">Hausvia System:</span>
                        {message.body}
                      </article>
                    </div>
                  ) : (
                    <div
                      className={`group flex items-end gap-2 ${
                        isCurrentUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isCurrentUser ? (
                        <span
                          aria-hidden="true"
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-[0.65rem] font-black shadow-sm sm:size-9 ${
                            senderRole
                              ? roleAvatarClasses[senderRole]
                              : "bg-slate-500 text-white"
                          }`}
                        >
                          {chatInitials(message.sender_display_name, senderRole)}
                        </span>
                      ) : null}

                      {!readOnly && isCurrentUser ? (
                        <ReactionPicker
                          propertyId={propertyId}
                          message={message}
                          currentUserId={currentUserId}
                          align="right"
                        />
                      ) : null}

                      <article
                        className={`relative max-w-[84%] rounded-2xl border px-3 py-2.5 shadow-[0_2px_8px_rgba(8,43,97,0.08)] sm:max-w-[72%] sm:px-3.5 ${
                          isCurrentUser
                            ? "rounded-br-md border-[#08AEB4]/25 bg-[#DDF7F1]"
                            : "rounded-bl-md border-white bg-white"
                        }`}
                      >
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[0.7rem] font-black text-slate-800">
                            {senderName}
                          </span>
                          <span
                            className={`inline-flex min-h-5 items-center rounded-full border px-2 text-[0.58rem] font-black uppercase tracking-[0.08em] ${
                              senderRole
                                ? roleBadgeClasses[senderRole]
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {chatRoleLabel(senderRole)}
                          </span>
                        </div>

                        <p className="whitespace-pre-wrap text-sm leading-5 text-slate-900 [overflow-wrap:anywhere] sm:leading-6">
                          {message.body}
                        </p>

                        {message.message_attachments?.map((attachment) => (
                          <Attachment
                            key={attachment.id}
                            attachment={attachment}
                            url={signedAttachmentUrls[attachment.id]}
                          />
                        ))}

                        {reactionCounts.size ? (
                          <div className="mt-2 flex flex-wrap gap-1" aria-label="Reaktionen">
                            {[...reactionCounts.entries()].map(([emoji, count]) => (
                              <span
                                key={emoji}
                                className="inline-flex min-h-6 items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 text-[0.68rem] font-black text-slate-700 shadow-sm"
                              >
                                <span aria-hidden="true">{emoji}</span>
                                {count}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-1.5 flex items-center justify-end gap-1 text-[0.62rem] font-bold text-slate-500">
                          <time dateTime={message.created_at}>
                            {chatMessageTime(message.created_at)}
                          </time>
                          {isCurrentUser ? (
                            <CheckCheck
                              aria-label={
                                message.message_reads?.some(
                                  (read) => read.user_id !== currentUserId,
                                )
                                  ? "Von mindestens einer Person gelesen"
                                  : "Gesendet"
                              }
                              size={15}
                              className={
                                message.message_reads?.some(
                                  (read) => read.user_id !== currentUserId,
                                )
                                  ? "text-[#08AEB4]"
                                  : "text-slate-400"
                              }
                            />
                          ) : null}
                        </div>
                      </article>

                      {!readOnly && !isCurrentUser ? (
                        <ReactionPicker
                          propertyId={propertyId}
                          message={message}
                          currentUserId={currentUserId}
                          align="left"
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="grid flex-1 place-items-center py-16 text-center">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-brand shadow-sm">
                  <UsersRound aria-hidden="true" size={25} />
                </span>
                <p className="mt-4 font-black text-slate-900">Noch keine Nachrichten</p>
                <p className="mt-1 text-sm text-slate-500">
                  Schreiben Sie die erste Nachricht in die Gruppe.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {readOnly ? (
        <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-600">
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
          className="border-t border-slate-200 bg-white p-2.5 sm:p-3"
        >
          <input type="hidden" name="propertyId" value={propertyId} />

          {sendState.status === "error" && !sendPending ? (
            <div
              id="chat-submit-feedback"
              role="alert"
              aria-live="assertive"
              className="mb-2.5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-800"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
              <span>{sendState.message}</span>
            </div>
          ) : sendState.status === "success" ? (
            <p role="status" className="sr-only">{sendState.message}</p>
          ) : null}

          {attachmentFeedback ? (
            <div
              id="chat-attachment-feedback"
              role={attachmentFeedback.tone === "error" ? "alert" : "status"}
              className={`mb-2.5 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                attachmentFeedback.tone === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-[#08AEB4]/25 bg-[#E7F8F9] text-[#056C71]"
              }`}
            >
              {attachmentOptimizing ? (
                <LoaderCircle aria-hidden="true" className="shrink-0 animate-spin" size={15} />
              ) : (
                <Paperclip aria-hidden="true" className="shrink-0" size={15} />
              )}
              <span className="min-w-0 flex-1 truncate">{attachmentFeedback.message}</span>
              {preparedAttachment ? (
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Anhang entfernen"
                  className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/70"
                >
                  <X aria-hidden="true" size={15} />
                </button>
              ) : null}
            </div>
          ) : null}

          <fieldset
            disabled={sendPending || attachmentOptimizing}
            className="m-0 flex min-w-0 items-end gap-2 border-0 p-0"
          >
            <label className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 transition hover:border-brand/20 hover:bg-brand-soft hover:text-brand">
              <span className="sr-only">Bild, Video oder PDF auswählen</span>
              <Paperclip aria-hidden="true" size={20} />
              <input
                ref={attachmentInputRef}
                name="attachment"
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                aria-describedby="chat-upload-hint chat-attachment-feedback"
                onChange={(event) => {
                  void prepareAttachment(event.currentTarget.files?.[0] ?? null);
                }}
                className="sr-only"
              />
            </label>

            <label htmlFor={`chat-message-${propertyId}`} className="sr-only">
              Nachricht
            </label>
            <textarea
              id={`chat-message-${propertyId}`}
              name="body"
              required
              maxLength={4000}
              rows={1}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  messageFormRef.current?.requestSubmit();
                }
              }}
              className="min-h-12 max-h-32 min-w-0 flex-1 resize-none rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-brand/35 focus:bg-white focus:ring-4 focus:ring-brand/10"
              placeholder="Nachricht schreiben …"
            />

            <button
              type="submit"
              disabled={sendPending || attachmentOptimizing}
              aria-label={
                attachmentOptimizing
                  ? "Foto wird optimiert"
                  : sendPending
                    ? "Nachricht wird gesendet"
                    : "Nachricht senden"
              }
              className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white shadow-[0_8px_20px_rgba(8,43,97,0.2)] transition hover:-translate-y-0.5 hover:bg-brand-dark disabled:pointer-events-none disabled:opacity-50"
            >
              {sendPending || attachmentOptimizing ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" size={20} />
              ) : (
                <Send aria-hidden="true" size={20} />
              )}
            </button>
          </fieldset>

          <p id="chat-upload-hint" className="mt-1.5 px-14 text-[0.62rem] font-semibold leading-4 text-slate-400 sm:text-[0.68rem]">
            Enter sendet · Shift + Enter fügt eine Zeile ein · Fotos bis 30 MB werden optimiert · Videos/PDFs max. {Math.round(MAX_CHAT_FILE_BYTES / 1024 / 1024)} MB
          </p>
        </form>
      )}
    </section>
  );
}
