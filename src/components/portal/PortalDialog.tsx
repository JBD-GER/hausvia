"use client";

import { X } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { buttonClass } from "@/components/portal/PortalUI";

type DialogSize = "md" | "lg" | "xl" | "wide";

const dialogSizes: Record<DialogSize, string> = {
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
  wide: "sm:max-w-6xl",
};

export function PortalDialog({
  triggerLabel,
  triggerIcon,
  title,
  description,
  children,
  size = "lg",
  triggerClassName = buttonClass,
}: {
  triggerLabel: string;
  triggerIcon?: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: DialogSize;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerIcon}
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className={`m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-hidden rounded-[1.5rem] border border-white/70 bg-white p-0 text-left text-slate-950 shadow-[0_32px_100px_rgba(3,18,43,0.32)] backdrop:bg-slate-950/55 backdrop:backdrop-blur-sm open:flex open:flex-col ${dialogSizes[size]}`}
      >
        <div className="z-20 flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#087f83]">
              Schnellaktion
            </p>
            <h2 id={titleId} className="mt-1 text-xl font-black tracking-[-0.03em] sm:text-2xl">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="mt-1.5 text-sm leading-6 text-slate-600">
                {description}
              </div>
            ) : null}
          </div>
          <form method="dialog">
            <button
              type="submit"
              aria-label="Dialog schließen"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-brand/25 hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </form>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </div>
      </dialog>
    </>
  );
}
