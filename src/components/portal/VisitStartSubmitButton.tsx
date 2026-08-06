"use client";

import { LoaderCircle, PlayCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function VisitStartSubmitButton({
  disabled = false,
  disabledLabel = "Laufenden Einsatz zuerst abschließen",
}: {
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  const label = pending
    ? "Einsatz wird gestartet …"
    : disabled
      ? disabledLabel
      : "Einsatz starten";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(8,43,97,0.2)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(8,43,97,0.26)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 focus-visible:ring-offset-2 active:translate-y-0 disabled:pointer-events-none disabled:bg-none disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none sm:w-auto"
    >
      {pending ? (
        <span aria-hidden="true" className="animate-spin">
          <LoaderCircle size={18} />
        </span>
      ) : (
        <PlayCircle aria-hidden="true" size={18} />
      )}
      <span>{label}</span>
    </button>
  );
}
