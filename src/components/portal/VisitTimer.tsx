"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function durationLabel(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function VisitTimer({ startedAt }: { startedAt: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - startMs) / 1000));

  useEffect(() => {
    const update = () => setSeconds(Math.floor((Date.now() - startMs) / 1000));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [startMs]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-950">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white"><Clock3 size={22} /></span><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Einsatz läuft</p><p className="text-sm font-bold">Startzeit wird serverseitig geführt</p></div></div>
      <output aria-live="off" className="font-mono text-xl font-black tabular-nums sm:text-2xl">{durationLabel(seconds)}</output>
    </div>
  );
}
