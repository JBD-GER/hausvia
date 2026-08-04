"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileStickyCTA() {
  const pathname = usePathname();

  if (pathname === "/angebot-anfragen" || pathname === "/kosten-einschaetzen" || pathname === "/kontakt") {
    return null;
  }

  if (pathname === "/winterdienst-hannover") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-cyan-200 bg-white/96 p-3 shadow-[0_-8px_30px_rgba(8,47,73,0.16)] backdrop-blur md:hidden">
        <Link
          href="#winterdienst-preis"
          className="flex min-h-12 items-center justify-center rounded-md bg-cyan-600 px-3 py-3 text-center text-sm font-bold text-white"
        >
          Preis berechnen
        </Link>
        <Link
          href="/angebot-anfragen?leistung=winterdienst"
          className="flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-3 py-3 text-center text-sm font-bold text-white"
        >
          Winterdienst anfragen
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/96 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
      <Link
        href="/angebot-anfragen"
        className="flex min-h-12 items-center justify-center rounded-md bg-brand px-4 py-3 text-sm font-bold text-white"
      >
        Kostenlose Anfrage starten
      </Link>
    </div>
  );
}
