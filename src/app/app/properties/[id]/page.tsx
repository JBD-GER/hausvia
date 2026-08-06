import Link from "next/link";
import { Building2, MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { sendEmployeePropertyMessageAction } from "@/app/actions/portalEmployee";
import { CompactSection, PageHeader, Panel, StatusPill } from "@/components/portal/PortalUI";
import { PropertyChat } from "@/components/portal/PropertyChat";
import { PropertyRealtimeRefresh } from "@/components/portal/PropertyRealtimeRefresh";
import { requireEmployeeContext } from "@/lib/portal/access";
import { attachChatSenderRoles } from "@/lib/portal/chatSenderRoles";
import { createPrivateAttachmentUrls } from "@/lib/portal/files";

export default async function EmployeePropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; view?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const view = query.view === "chat" ? "chat" : "overview";
  const { profile, supabase } = await requireEmployeeContext();
  const { data: property } = await supabase
    .from("properties")
    .select(
      "id,name,status,buildings(id,label,formatted_address),property_services(id,name,customer_description,status,seasonal,season_start_month,season_end_month)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();
  const serviceIds =
    property.property_services?.map((service) => service.id) ?? [];
  const buildingIds = property.buildings?.map((building) => building.id) ?? [];
  const [
    { data: briefing },
    { data: instructions },
    { data: accessNotes },
    { data: messages },
  ] = await Promise.all([
      supabase
        .from("property_briefings")
        .select("internal_briefing")
        .eq("property_id", id)
        .maybeSingle(),
      serviceIds.length
        ? supabase
            .from("property_service_instructions")
            .select("property_service_id,internal_instruction")
            .in("property_service_id", serviceIds)
        : Promise.resolve({
            data: [] as {
              property_service_id: string;
              internal_instruction: string | null;
            }[],
          }),
      buildingIds.length
        ? supabase
            .from("building_access_notes")
            .select("building_id,access_notes")
            .in("building_id", buildingIds)
        : Promise.resolve({
            data: [] as { building_id: string; access_notes: string | null }[],
          }),
      supabase
        .from("property_messages")
        .select(
          "id,body,message_type,created_at,sender_id,sender_display_name,message_attachments(id,bucket,path,filename,mime_type),message_reactions(emoji,user_id),message_reads(user_id,read_at)",
        )
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
  const instructionByService = new Map(
    (instructions ?? []).map((instruction) => [
      instruction.property_service_id,
      instruction.internal_instruction,
    ]),
  );
  const accessNotesByBuildingId = new Map(
    (accessNotes ?? []).map((note) => [note.building_id, note.access_notes]),
  );
  const chatMessages = await attachChatSenderRoles(
    (messages ?? []).slice().reverse(),
  );
  const signedAttachmentUrls = await createPrivateAttachmentUrls(
    supabase,
    chatMessages.flatMap((message) => message.message_attachments ?? []),
  );
  return (
    <>
      <PropertyRealtimeRefresh propertyId={property.id} />
      <PageHeader
        eyebrow="Zugewiesene Immobilie"
        title={property.name}
        text={`${property.buildings?.length ?? 0} Gebäude`}
        icon={<Building2 aria-hidden="true" size={20} />}
        compact
      />
      {query.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          {query.error}
        </p>
      ) : null}
      <nav aria-label="Objektbereiche" className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <Link
          href={`/app/properties/${property.id}?view=overview`}
          aria-current={view === "overview" ? "page" : undefined}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${view === "overview" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <Building2 aria-hidden="true" size={17} /> Übersicht
        </Link>
        <Link
          href={`/app/properties/${property.id}?view=chat`}
          aria-current={view === "chat" ? "page" : undefined}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${view === "chat" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <MessageCircle aria-hidden="true" size={17} /> Chat
        </Link>
      </nav>
      {view === "overview" ? (
        <div className="grid gap-4">
          <CompactSection title="Gebäude & Zugang" description="Adressen und objektspezifische Zugangshinweise" defaultOpen>
            <div className="grid gap-3">
              {property.buildings?.map((building) => (
                <article
                  key={building.id}
                  className="rounded-xl bg-slate-50 p-4"
                >
                  <p className="font-black text-slate-950">
                    {building.label || "Gebäude"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {building.formatted_address}
                  </p>
                  {accessNotesByBuildingId.get(building.id) ? (
                    <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700">
                      <strong>Zugang:</strong> {accessNotesByBuildingId.get(building.id)}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </CompactSection>
          <CompactSection title="Internes Briefing" description="Wichtige Hinweise vor dem Einsatz">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {briefing?.internal_briefing || "Kein Briefing hinterlegt."}
            </p>
          </CompactSection>
          <CompactSection
            title="Aktive Leistungen"
            description="Interne Arbeitsanweisungen je Leistung"
            badge={<StatusPill>{property.property_services?.filter((service) => service.status === "active").length ?? 0}</StatusPill>}
          >
            <div className="grid gap-3">
              {property.property_services
                ?.filter((service) => service.status === "active")
                .map((service) => (
                  <article
                    key={service.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <p className="font-black text-slate-950">
                        {service.name}
                      </p>
                      {service.seasonal ? (
                        <StatusPill>
                          {service.season_start_month}–
                          {service.season_end_month}
                        </StatusPill>
                      ) : null}
                    </div>
                    {instructionByService.get(service.id) ? (
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {instructionByService.get(service.id)}
                      </p>
                    ) : null}
                  </article>
                ))}
            </div>
          </CompactSection>
        </div>
      ) : (
          <Panel title="Immobilien-Chat" description="Nachrichten und Anhänge zur Immobilie">
            <PropertyChat
              propertyId={property.id}
              propertyName={property.name}
              currentUserId={profile.id}
              currentUserRole={profile.role}
              messages={chatMessages}
              signedAttachmentUrls={signedAttachmentUrls}
              sendMessageAction={sendEmployeePropertyMessageAction}
            />
          </Panel>
      )}
    </>
  );
}
