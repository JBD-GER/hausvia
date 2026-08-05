import { notFound } from "next/navigation";
import { sendEmployeePropertyMessageAction } from "@/app/actions/portalEmployee";
import { PageHeader, Panel, StatusPill } from "@/components/portal/PortalUI";
import { PropertyChat } from "@/components/portal/PropertyChat";
import { PropertyRealtimeRefresh } from "@/components/portal/PropertyRealtimeRefresh";
import { requireEmployeeContext } from "@/lib/portal/access";
import { createPrivateAttachmentUrls } from "@/lib/portal/files";

export default async function EmployeePropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
  const chatMessages = (messages ?? []).slice().reverse();
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
      />
      {query.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          {query.error}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-5">
          <Panel title="Gebäude & Zugang">
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
          </Panel>
          <Panel title="Internes Briefing">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {briefing?.internal_briefing || "Kein Briefing hinterlegt."}
            </p>
          </Panel>
          <Panel title="Aktive Leistungen">
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
          </Panel>
        </div>
        <div className="grid content-start gap-5">
          <Panel title="Immobilien-Chat">
            <PropertyChat
              propertyId={property.id}
              currentUserId={profile.id}
              messages={chatMessages}
              signedAttachmentUrls={signedAttachmentUrls}
              sendMessageAction={sendEmployeePropertyMessageAction}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
