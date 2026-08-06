import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PageHeader, Panel } from "@/components/portal/PortalUI";
import { QrPrintActions } from "@/components/portal/QrPrintActions";
import { requireAdminContext } from "@/lib/portal/access";
import { deriveBuildingQrToken, safeHashEquals } from "@/lib/portal/security";

type QrAvailability =
  | { available: true }
  | { available: false; title: string; text: string; configurationMissing?: boolean };

function qrAvailability({
  buildingId,
  buildingStatus,
  propertyStatus,
  nonce,
  expectedHash,
}: {
  buildingId: string;
  buildingStatus: string;
  propertyStatus?: string;
  nonce?: string | null;
  expectedHash?: string | null;
}): QrAvailability {
  if (buildingStatus !== "active" || propertyStatus !== "active") {
    return {
      available: false,
      title: "QR-Code derzeit nicht verfügbar",
      text: "Aktivieren Sie zuerst sowohl die Immobilie als auch das Gebäude. Erst danach kann ein gültiger öffentlicher Meldelink ausgegeben werden.",
    };
  }
  if (!nonce || !expectedHash) {
    return {
      available: false,
      title: "QR-Code muss erneuert werden",
      text: "Für dieses Gebäude fehlen sichere QR-Daten. Erneuern Sie den Token in der Immobilienansicht.",
    };
  }
  if (!process.env.QR_TOKEN_SECRET || process.env.QR_TOKEN_SECRET.length < 32) {
    return {
      available: false,
      configurationMissing: true,
      title: "QR-Funktion noch nicht eingerichtet",
      text: "Die sichere QR-Konfiguration fehlt in dieser Umgebung. Nach der Einrichtung und einem erneuten Deployment steht die Druckvorlage zur Verfügung.",
    };
  }

  try {
    const token = deriveBuildingQrToken(buildingId, nonce);
    if (!safeHashEquals(token, expectedHash)) {
      return {
        available: false,
        title: "QR-Code muss einmal erneuert werden",
        text: "Der gespeicherte QR-Code passt nicht mehr zur aktuellen sicheren Konfiguration. Widerrufen und erneuern Sie den Token in der Immobilienansicht.",
      };
    }
  } catch {
    return {
      available: false,
      configurationMissing: true,
      title: "QR-Funktion noch nicht eingerichtet",
      text: "Die sichere QR-Konfiguration ist in dieser Umgebung nicht vollständig. Nach der Einrichtung steht die Druckvorlage zur Verfügung.",
    };
  }

  return { available: true };
}

export default async function BuildingQrPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { admin: supabase } = await requireAdminContext();
  const { data: building, error } = await supabase
    .from("buildings")
    .select(
      "id,label,formatted_address,status,qr_token_nonce,qr_token_hash,properties(id,name,status)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !building) notFound();
  const property = Array.isArray(building.properties)
    ? building.properties[0]
    : building.properties;
  if (!property) notFound();

  const availability = qrAvailability({
    buildingId: building.id,
    buildingStatus: building.status,
    propertyStatus: property.status,
    nonce: building.qr_token_nonce,
    expectedHash: building.qr_token_hash,
  });
  const title = building.label || property.name || "Gebäude";
  const propertyHref = `/admin/properties/${property.id}`;

  if (!availability.available) {
    return (
      <>
        <PageHeader
          eyebrow="Gebäude-QR-Code"
          title={title}
          text={building.formatted_address}
          actions={(
            <Link
              href={propertyHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-brand shadow-sm transition hover:border-brand/30 hover:bg-brand-soft"
            >
              <ArrowLeft aria-hidden="true" size={18} />
              Zur Immobilie
            </Link>
          )}
        />
        <Panel title={availability.title}>
          <div
            role="status"
            className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-start ${
              availability.configurationMissing
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white shadow-sm">
              <AlertTriangle className="text-amber-600" aria-hidden="true" size={25} />
            </span>
            <div>
              <p className="font-black">Die Druckvorlage wurde bewusst gesperrt.</p>
              <p className="mt-1 text-sm leading-6">{availability.text}</p>
              <Link href={propertyHref} className="mt-4 inline-flex font-extrabold text-brand underline underline-offset-4">
                Immobilienansicht öffnen
              </Link>
            </div>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow="Gebäude-QR-Code"
          title={title}
          text={`${building.formatted_address} · Druckfertige Meldetafel`}
          actions={(
            <Link
              href={propertyHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-brand shadow-sm transition hover:border-brand/30 hover:bg-brand-soft"
            >
              <ArrowLeft aria-hidden="true" size={18} />
              Zur Immobilie
            </Link>
          )}
        />
      </div>

      <section className="mx-auto max-w-2xl rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_rgba(8,43,97,0.12)] sm:p-8 print:fixed print:inset-0 print:z-[200] print:flex print:h-screen print:w-screen print:max-w-none print:items-center print:justify-center print:overflow-hidden print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mx-auto w-full max-w-lg text-center print:max-w-[125mm]">
          <div className="flex justify-center">
            <Logo href={propertyHref} />
          </div>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.2em] text-[#087f83]">
            Hausvia Gebäudemeldung
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Schaden melden
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
            QR-Code mit der Smartphone-Kamera scannen und die Meldung sicher direkt an Hausvia senden.
          </p>

          <div className="relative mx-auto mt-6 w-fit rounded-[1.75rem] border-2 border-brand/15 bg-white p-3 shadow-[0_16px_40px_rgba(8,43,97,0.10)] print:mt-5 print:p-2 print:shadow-none">
            <Image
              src={`/api/buildings/${id}/qr`}
              alt={`QR-Code für ${building.formatted_address}`}
              width={420}
              height={420}
              sizes="(max-width: 640px) 84vw, 420px"
              priority
              unoptimized
              className="size-[min(78vw,26rem)] rounded-2xl bg-white sm:size-[26rem] print:size-[92mm]"
            />
            <span className="absolute -right-2 -top-2 grid size-10 place-items-center rounded-full bg-emerald-600 text-white shadow-lg print:hidden">
              <CheckCircle2 aria-hidden="true" size={21} />
            </span>
          </div>

          <div className="mx-auto mt-5 max-w-md rounded-2xl bg-brand-soft/70 px-4 py-3">
            <p className="font-black text-brand">{title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-700">{building.formatted_address}</p>
          </div>
          <p className="mt-4 inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
            <ShieldCheck aria-hidden="true" size={16} className="text-[#087f83]" />
            Sicherer, gebäudebezogener Meldelink
          </p>

          <QrPrintActions buildingId={building.id} />
        </div>
      </section>
    </>
  );
}
