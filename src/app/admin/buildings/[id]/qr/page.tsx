import Image from "next/image";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/portal/PortalUI";
import { requireAdminContext } from "@/lib/portal/access";

export default async function BuildingQrPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin: supabase } = await requireAdminContext();
  const { data: building } = await supabase.from("buildings").select("id,label,formatted_address,properties(name)").eq("id", id).maybeSingle();
  if (!building) notFound();
  const property = Array.isArray(building.properties) ? building.properties[0] : building.properties;
  return <><PageHeader eyebrow="Gebäude-QR-Code" title={building.label || property?.name || "Gebäude"} text={building.formatted_address} /><Panel title="Druckvorlage"><div className="mx-auto max-w-md text-center"><Image src={`/api/buildings/${id}/qr`} alt={`QR-Code für ${building.formatted_address}`} width={420} height={420} unoptimized className="mx-auto rounded-2xl border border-slate-200 bg-white p-4" /><p className="mt-4 text-lg font-black text-slate-950">Schaden melden</p><p className="mt-1 text-sm text-slate-600">QR-Code scannen und Meldung sicher an Hausvia senden.</p><div className="mt-6 flex flex-wrap justify-center gap-3 print:hidden"><a href={`/api/buildings/${id}/qr`} className="rounded-xl bg-brand px-4 py-3 text-sm font-black text-white">PNG herunterladen</a><a href={`/api/buildings/${id}/qr?format=svg`} className="rounded-xl border border-brand px-4 py-3 text-sm font-black text-brand">SVG herunterladen</a></div><p className="mt-5 text-xs text-slate-500 print:hidden">Zum Drucken bitte die Druckfunktion Ihres Browsers verwenden.</p></div></Panel></>;
}
