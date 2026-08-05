import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "Meldelink nicht verfügbar | Hausvia", robots: { index: false, follow: false } };

export default function InvalidDamagePage() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg"><AlertTriangle className="mx-auto text-amber-600" size={44} /><h1 className="mt-4 text-2xl font-black text-slate-950">Meldelink nicht verfügbar</h1><p className="mt-3 leading-6 text-slate-600">Bitte scannen Sie den aktuellen QR-Code am Gebäude oder wenden Sie sich an Hausvia.</p></section></main>;
}
