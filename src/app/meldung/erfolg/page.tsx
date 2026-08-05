import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Meldung eingegangen | Hausvia",
  robots: { index: false, follow: false, nocache: true },
};

export default function DamageSuccessPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
        <Logo href="/" />
        <CheckCircle2 className="mx-auto mt-8 text-emerald-600" size={52} aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-black text-slate-950">Vielen Dank</h1>
        <p className="mt-3 leading-7 text-slate-600">Die Schadensmeldung ist sicher bei Hausvia eingegangen und wurde dem zuständigen Gebäude zugeordnet.</p>
        <Link href="/" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-black text-white">Zur Hausvia-Website</Link>
      </div>
    </main>
  );
}
