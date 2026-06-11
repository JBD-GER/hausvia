"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileStickyCTA() {
  const pathname = usePathname();

  if (pathname === "/angebot-anfragen" || pathname === "/kontakt") {
    return null;
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
