import Link from "next/link";
import {
  archiveEquipmentAction,
  assignEquipmentEmployeeAction,
  assignEquipmentVisitAction,
  createEquipmentAction,
  removeEquipmentVisitAction,
  returnEquipmentEmployeeAction,
  updateEquipmentDetailsAction,
  updateEquipmentStateAction,
  uploadEquipmentPhotoAction,
} from "@/app/actions/portalEquipmentAdmin";
import {
  EmptyState,
  Field,
  PageHeader,
  Panel,
  StatusPill,
  buttonClass,
  inputClass,
} from "@/components/portal/PortalUI";
import { PaginationNav } from "@/components/portal/PaginationNav";
import { requireAdminContext } from "@/lib/portal/access";
import { formatCents, formatGermanDate } from "@/lib/portal/core";
import { createPrivateAttachmentUrls } from "@/lib/portal/files";
import { paginateItems } from "@/lib/portal/listing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const categoryLabels: Record<string, string> = {
  device: "Gerät",
  tool: "Werkzeug",
  consumable: "Verbrauchsmaterial",
  cleaning_product: "Reinigungsmittel",
  rental: "Mietequipment",
  protective_clothing: "Schutzkleidung",
  other: "Sonstiges",
};

const conditionLabels: Record<string, string> = {
  available: "Verfügbar",
  in_use: "Im Einsatz",
  empty: "Leer",
  defective: "Defekt",
  in_repair: "In Reparatur",
  lost: "Verloren",
  archived: "Archiviert",
};

const catalogStatusLabels: Record<string, string> = {
  active: "Aktiv",
  archived: "Archiviert",
};

function queryValue(params: Awaited<SearchParams>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function employeeName(employee: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}) {
  return (
    employee.full_name ||
    [employee.first_name, employee.last_name].filter(Boolean).join(" ") ||
    "Mitarbeiter"
  );
}

function visitLabel(visit: {
  scheduled_start: string;
  status: string;
  properties?: unknown;
}) {
  const property = relation(visit.properties as { name?: string | null } | null);
  return `${formatGermanDate(visit.scheduled_start, {
    hour: "2-digit",
    minute: "2-digit",
  })} · ${property?.name || "Immobilie"}${visit.status === "started" ? " · läuft" : ""}`;
}

export default async function AdminEquipmentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = queryValue(params, "q").trim().toLocaleLowerCase("de");
  const category = queryValue(params, "category");
  const condition = queryValue(params, "condition");
  const catalogStatus = queryValue(params, "catalogStatus");
  const sort = queryValue(params, "sort") || "newest";
  const { admin: supabase } = await requireAdminContext();

  const [
    { data: equipment, error: equipmentError },
    { data: equipmentDetails, error: equipmentDetailsError },
    { data: propertyAssignments, error: propertyAssignmentsError },
    { data: properties, error: propertiesError },
    { data: employees, error: employeesError },
    { data: employeeAssignments, error: employeeAssignmentsError },
    { data: openVisits, error: openVisitsError },
  ] = await Promise.all([
    supabase.from("equipment").select("*").order("created_at", { ascending: false }),
    supabase.from("equipment_admin_details").select("*"),
    supabase.from("property_equipment").select("*").eq("active", true),
    supabase.from("properties").select("id,name"),
    supabase
      .from("employee_profiles")
      .select("id,first_name,last_name,full_name,status")
      .order("full_name", { ascending: true }),
    supabase
      .from("equipment_employee_assignments")
      .select("equipment_id,employee_id,assigned_at,returned_at")
      .is("returned_at", null)
      .order("assigned_at", { ascending: true }),
    supabase
      .from("visits")
      .select("id,property_id,scheduled_start,status,properties(id,name)")
      .in("status", ["scheduled", "started"])
      .order("scheduled_start", { ascending: true })
      .limit(200),
  ]);

  if (
    equipmentError ||
    equipmentDetailsError ||
    propertyAssignmentsError ||
    propertiesError ||
    employeesError ||
    employeeAssignmentsError ||
    openVisitsError
  ) {
    throw new Error("Der Equipment-Katalog konnte nicht vollständig geladen werden.");
  }

  const openVisitIds = (openVisits ?? []).map((visit) => visit.id);
  const { data: visitAssignments, error: visitAssignmentsError } = openVisitIds.length
    ? await supabase
        .from("visit_equipment")
        .select("visit_id,equipment_id,required_quantity,rental,provision_note,created_at")
        .in("visit_id", openVisitIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (visitAssignmentsError) {
    throw new Error("Die Einsatzzuweisungen des Equipments konnten nicht geladen werden.");
  }

  const detailsByEquipmentId = new Map(
    (equipmentDetails ?? []).map((details) => [details.equipment_id, details]),
  );
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));
  const employeeById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const visitById = new Map((openVisits ?? []).map((visit) => [visit.id, visit]));

  const filteredEquipment = (equipment ?? [])
    .filter((item) => {
      const details = detailsByEquipmentId.get(item.id);
      const haystack = [
        item.name,
        item.sku,
        item.description,
        details?.supplier,
        item.storage_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de");
      return (
        (!search || haystack.includes(search)) &&
        (!category || item.category === category) &&
        (!condition || item.condition === condition) &&
        (!catalogStatus || item.status === catalogStatus)
      );
    })
    .sort((left, right) => {
      if (sort === "name") return String(left.name).localeCompare(String(right.name), "de");
      if (sort === "stock-low") return Number(left.current_stock) - Number(right.current_stock);
      if (sort === "oldest") return String(left.created_at).localeCompare(String(right.created_at));
      return String(right.created_at).localeCompare(String(left.created_at));
    });
  const equipmentPage = paginateItems(filteredEquipment, queryValue(params, "page"));
  const equipmentImageUrls = await createPrivateAttachmentUrls(
    supabase,
    equipmentPage.items.flatMap((item) =>
      item.image_bucket && item.image_path
        ? [{ id: item.id, bucket: item.image_bucket, path: item.image_path }]
        : [],
    ),
    600,
  );

  return (
    <>
      <PageHeader
        eyebrow="Equipment"
        title="Equipment verwalten"
        text="Geräte, Fotos, Zustände sowie aktive Mitarbeiter- und Einsatzzuweisungen zentral verwalten."
      />
      {queryValue(params, "status") ? (
        <p
          className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-900"
          role="status"
        >
          {queryValue(params, "status")}
        </p>
      ) : null}
      {queryValue(params, "error") ? (
        <p
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
          role="alert"
        >
          {queryValue(params, "error")}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="order-2 xl:order-1">
          <Panel title="Equipment anlegen">
          <form
            action={createEquipmentAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Name">
              <input name="name" required maxLength={180} className={inputClass} />
            </Field>
            <Field label="Kategorie">
              <select name="category" required defaultValue="device" className={inputClass}>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Interne Artikelnummer">
              <input name="sku" maxLength={100} className={inputClass} />
            </Field>
            <Field label="Einheit">
              <input name="unit" defaultValue="Stück" required maxLength={50} className={inputClass} />
            </Field>
            <Field label="Aktueller Bestand">
              <input
                name="currentStock"
                type="number"
                min="0"
                step="0.001"
                defaultValue="0"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Mindestbestand">
              <input
                name="minimumStock"
                type="number"
                min="0"
                step="0.001"
                defaultValue="0"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Zustand">
              <select name="condition" defaultValue="available" className={inputClass}>
                {Object.entries(conditionLabels)
                  .filter(([value]) => value !== "archived")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Eigentum oder Miete">
              <select name="ownershipType" defaultValue="owned" className={inputClass}>
                <option value="owned">Eigentum</option>
                <option value="rented">Miete</option>
              </select>
            </Field>
            <Field label="Vermieter oder Lieferant">
              <input name="supplier" maxLength={180} className={inputClass} />
            </Field>
            <Field label="Mietkosten netto">
              <input
                name="rentalCost"
                inputMode="decimal"
                pattern="\d{1,9}([.,]\d{1,2})?"
                defaultValue="0,00"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Lagerort">
              <input name="storageLocation" maxLength={180} className={inputClass} />
            </Field>
            <Field label="Foto (optional, max. 4 MB)">
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className={inputClass}
              />
            </Field>
            <label className="block sm:col-span-2">
              <span className="text-sm font-bold text-slate-800">Beschreibung</span>
              <textarea name="description" rows={3} maxLength={4_000} className={inputClass} />
            </label>
            <button className={`${buttonClass} sm:col-span-2`}>Equipment speichern</button>
          </form>
          </Panel>
        </div>

        <div className="order-1 grid content-start gap-5 xl:order-2">
          <Panel title="Suchen und filtern">
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Suche">
                <input
                  name="q"
                  defaultValue={queryValue(params, "q")}
                  placeholder="Name, Artikelnummer, Lagerort …"
                  className={inputClass}
                />
              </Field>
              <Field label="Kategorie">
                <select name="category" defaultValue={category} className={inputClass}>
                  <option value="">Alle Kategorien</option>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Zustand">
                <select name="condition" defaultValue={condition} className={inputClass}>
                  <option value="">Alle Zustände</option>
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Katalogstatus">
                <select name="catalogStatus" defaultValue={catalogStatus} className={inputClass}>
                  <option value="">Aktiv und archiviert</option>
                  {Object.entries(catalogStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sortierung">
                <select name="sort" defaultValue={sort} className={inputClass}>
                  <option value="newest">Neueste zuerst</option>
                  <option value="oldest">Älteste zuerst</option>
                  <option value="name">Name A–Z</option>
                  <option value="stock-low">Niedrigster Bestand</option>
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <button className={buttonClass}>Anwenden</button>
                <Link
                  href="/admin/equipment"
                  className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline"
                >
                  Zurücksetzen
                </Link>
              </div>
            </form>
          </Panel>

          <Panel title={`Equipment-Katalog (${filteredEquipment.length})`}>
            {filteredEquipment.length ? (
              <>
                <div className="grid gap-4">
                  {equipmentPage.items.map((item) => {
                    const propertyRelations = (propertyAssignments ?? []).filter(
                      (assignment) => assignment.equipment_id === item.id,
                    );
                    const activeEmployeeAssignments = (employeeAssignments ?? []).filter(
                      (assignment) => assignment.equipment_id === item.id,
                    );
                    const activeVisitAssignments = (visitAssignments ?? []).filter(
                      (assignment) => assignment.equipment_id === item.id,
                    );
                    const assignedEmployeeIds = new Set(
                      activeEmployeeAssignments.map((assignment) => assignment.employee_id),
                    );
                    const assignedVisitIds = new Set(
                      activeVisitAssignments.map((assignment) => assignment.visit_id),
                    );
                    const availableEmployees = (employees ?? []).filter(
                      (employee) =>
                        employee.status === "active" && !assignedEmployeeIds.has(employee.id),
                    );
                    const availableVisits = (openVisits ?? []).filter(
                      (visit) => !assignedVisitIds.has(visit.id),
                    );
                    const lowStock =
                      Number(item.current_stock || 0) <= Number(item.minimum_stock || 0);
                    const details = detailsByEquipmentId.get(item.id);
                    const imageUrl = equipmentImageUrls[item.id];

                    return (
                      <article
                        key={item.id}
                        className={`rounded-xl border p-4 ${
                          item.status === "archived"
                            ? "border-slate-300 bg-slate-100"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                          <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white">
                            {imageUrl ? (
                              <a href={imageUrl} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imageUrl}
                                  alt={`Foto von ${item.name}`}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </a>
                            ) : (
                              <div className="grid h-full place-items-center p-3 text-center text-xs font-bold text-slate-400">
                                Noch kein Foto
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h2 className="font-extrabold text-slate-950">{item.name}</h2>
                                <p className="mt-1 text-sm text-slate-650">
                                  {categoryLabels[item.category] ?? item.category} ·{" "}
                                  {item.sku || "ohne Artikelnummer"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <StatusPill>
                                  {conditionLabels[item.condition] ?? item.condition}
                                </StatusPill>
                                <StatusPill>
                                  {catalogStatusLabels[item.status] ?? item.status}
                                </StatusPill>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-700">
                              {item.description || "Keine Beschreibung."}
                            </p>
                          </div>
                        </div>

                        <dl className="mt-4 grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="font-bold text-slate-500">Bestand</dt>
                            <dd
                              className={`mt-1 font-extrabold ${
                                lowStock ? "text-red-700" : "text-slate-950"
                              }`}
                            >
                              {item.current_stock} {item.unit} / Mindestbestand {item.minimum_stock}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Lagerort</dt>
                            <dd className="mt-1 text-slate-800">{item.storage_location || "–"}</dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Eigentum</dt>
                            <dd className="mt-1 text-slate-800">
                              {item.ownership_type === "rented"
                                ? `Miete · ${formatCents(Number(details?.rental_cost_cents || 0))}`
                                : "Hausvia"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Immobilien</dt>
                            <dd className="mt-1 text-slate-800">
                              {propertyRelations
                                .map(
                                  (assignment) =>
                                    propertyById.get(assignment.property_id)?.name,
                                )
                                .filter(Boolean)
                                .join(", ") || "nicht zugeordnet"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Mitarbeiter</dt>
                            <dd className="mt-1 text-slate-800">
                              {activeEmployeeAssignments
                                .map((assignment) => employeeById.get(assignment.employee_id))
                                .filter(Boolean)
                                .map((employee) => employeeName(employee!))
                                .join(", ") || "nicht zugeordnet"}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500">Offene Einsätze</dt>
                            <dd className="mt-1 text-slate-800">
                              {activeVisitAssignments.length || "nicht zugeordnet"}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-4 grid gap-3">
                          <details className="rounded-xl border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer font-extrabold text-slate-900">
                              Stammdaten bearbeiten
                            </summary>
                            <form
                              action={updateEquipmentDetailsAction}
                              className="mt-4 grid gap-3 sm:grid-cols-2"
                            >
                              <input type="hidden" name="equipmentId" value={item.id} />
                              <input
                                type="hidden"
                                name="expectedUpdatedAt"
                                value={item.updated_at}
                              />
                              <input
                                type="hidden"
                                name="expectedDetailsUpdatedAt"
                                value={details?.updated_at || ""}
                              />
                              <input
                                type="hidden"
                                name="currentCondition"
                                value={item.condition}
                              />
                              <Field label="Name">
                                <input
                                  name="name"
                                  required
                                  maxLength={180}
                                  defaultValue={item.name}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Kategorie">
                                <select
                                  name="category"
                                  defaultValue={item.category}
                                  className={inputClass}
                                >
                                  {Object.entries(categoryLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Interne Artikelnummer">
                                <input
                                  name="sku"
                                  maxLength={100}
                                  defaultValue={item.sku || ""}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Einheit">
                                <input
                                  name="unit"
                                  required
                                  maxLength={50}
                                  defaultValue={item.unit}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Aktueller Bestand">
                                <input
                                  name="currentStock"
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  required
                                  defaultValue={item.current_stock}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Mindestbestand">
                                <input
                                  name="minimumStock"
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  required
                                  defaultValue={item.minimum_stock}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Eigentum oder Miete">
                                <select
                                  name="ownershipType"
                                  defaultValue={item.ownership_type}
                                  className={inputClass}
                                >
                                  <option value="owned">Eigentum</option>
                                  <option value="rented">Miete</option>
                                </select>
                              </Field>
                              <Field label="Vermieter oder Lieferant">
                                <input
                                  name="supplier"
                                  maxLength={180}
                                  defaultValue={details?.supplier || ""}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Mietkosten netto">
                                <input
                                  name="rentalCost"
                                  inputMode="decimal"
                                  pattern="\d{1,9}([.,]\d{1,2})?"
                                  required
                                  defaultValue={(Number(details?.rental_cost_cents || 0) / 100)
                                    .toFixed(2)
                                    .replace(".", ",")}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Lagerort">
                                <input
                                  name="storageLocation"
                                  maxLength={180}
                                  defaultValue={item.storage_location || ""}
                                  className={inputClass}
                                />
                              </Field>
                              <label className="block sm:col-span-2">
                                <span className="text-sm font-bold text-slate-800">Beschreibung</span>
                                <textarea
                                  name="description"
                                  rows={3}
                                  maxLength={4_000}
                                  defaultValue={item.description || ""}
                                  className={inputClass}
                                />
                              </label>
                              <button type="submit" className={`${buttonClass} sm:col-span-2`}>
                                Stammdaten speichern
                              </button>
                            </form>
                          </details>

                          <details className="rounded-xl border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer font-extrabold text-slate-900">
                              Foto und Status bearbeiten
                            </summary>
                            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                              <form
                                action={uploadEquipmentPhotoAction}
                                className="rounded-lg bg-slate-50 p-3"
                              >
                                <input type="hidden" name="equipmentId" value={item.id} />
                                <Field label={imageUrl ? "Foto ersetzen" : "Foto hochladen"}>
                                  <input
                                    name="photo"
                                    type="file"
                                    required
                                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                                    className={inputClass}
                                  />
                                </Field>
                                <p className="mt-2 text-xs text-slate-500">
                                  JPEG, PNG, WebP, HEIC oder HEIF · maximal 4 MB
                                </p>
                                <button className={`${buttonClass} mt-3`}>Foto speichern</button>
                              </form>

                              <form
                                action={updateEquipmentStateAction}
                                className="grid gap-3 rounded-lg bg-slate-50 p-3"
                              >
                                <input type="hidden" name="equipmentId" value={item.id} />
                                <input
                                  type="hidden"
                                  name="expectedUpdatedAt"
                                  value={item.updated_at}
                                />
                                <input type="hidden" name="status" value="active" />
                                <Field label="Zustand">
                                  <select
                                    name="condition"
                                    defaultValue={
                                      item.condition === "archived" ? "available" : item.condition
                                    }
                                    className={inputClass}
                                  >
                                    {Object.entries(conditionLabels)
                                      .filter(([value]) => value !== "archived")
                                      .map(([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      ))}
                                  </select>
                                </Field>
                                <button type="submit" className={buttonClass}>
                                  {item.status === "archived"
                                    ? "Equipment reaktivieren"
                                    : "Zustand speichern"}
                                </button>
                              </form>

                              {item.status === "active" ? (
                                <form
                                  action={archiveEquipmentAction}
                                  className="rounded-lg border border-red-200 bg-red-50 p-3 lg:col-start-2"
                                >
                                  <input type="hidden" name="equipmentId" value={item.id} />
                                  <input
                                    type="hidden"
                                    name="expectedUpdatedAt"
                                    value={item.updated_at}
                                  />
                                  <p className="text-sm font-bold text-red-900">
                                    Archivieren blendet das Equipment aus neuen Zuweisungen aus. Historische
                                    Einsatzdaten bleiben erhalten.
                                  </p>
                                  <button
                                    type="submit"
                                    className="mt-3 min-h-11 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-100"
                                  >
                                    {item.name} archivieren
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </details>

                          <details className="rounded-xl border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer font-extrabold text-slate-900">
                              Mitarbeiterzuweisungen ({activeEmployeeAssignments.length})
                            </summary>
                            <div className="mt-4 grid gap-3">
                              {activeEmployeeAssignments.map((assignment) => {
                                const employee = employeeById.get(assignment.employee_id);
                                return (
                                  <div
                                    key={`${assignment.employee_id}-${assignment.assigned_at}`}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
                                  >
                                    <div>
                                      <p className="font-bold text-slate-900">
                                        {employee ? employeeName(employee) : "Unbekannter Mitarbeiter"}
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Zugewiesen am {formatGermanDate(assignment.assigned_at)}
                                      </p>
                                    </div>
                                    <form action={returnEquipmentEmployeeAction}>
                                      <input type="hidden" name="equipmentId" value={item.id} />
                                      <input
                                        type="hidden"
                                        name="employeeId"
                                        value={assignment.employee_id}
                                      />
                                      <button
                                        type="submit"
                                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-800 hover:border-brand"
                                      >
                                        Rückgabe für {employee ? employeeName(employee) : "Mitarbeiter"} buchen
                                      </button>
                                    </form>
                                  </div>
                                );
                              })}

                              {item.status === "active" ? (
                                availableEmployees.length ? (
                                  <form
                                    action={assignEquipmentEmployeeAction}
                                    className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-[1fr_auto] sm:items-end"
                                  >
                                    <input type="hidden" name="equipmentId" value={item.id} />
                                    <Field label="Aktiven Mitarbeiter auswählen">
                                      <select
                                        name="employeeId"
                                        required
                                        defaultValue=""
                                        className={inputClass}
                                      >
                                        <option value="" disabled>
                                          Bitte auswählen
                                        </option>
                                        {availableEmployees.map((employee) => (
                                          <option key={employee.id} value={employee.id}>
                                            {employeeName(employee)}
                                          </option>
                                        ))}
                                      </select>
                                    </Field>
                                    <button className={buttonClass}>Zuweisen</button>
                                  </form>
                                ) : (
                                  <p className="text-sm text-slate-600">
                                    Alle aktiven Mitarbeiter sind bereits zugeordnet.
                                  </p>
                                )
                              ) : (
                                <p className="text-sm text-slate-600">
                                  Archiviertes Equipment kann nicht neu zugewiesen werden.
                                </p>
                              )}
                            </div>
                          </details>

                          <details className="rounded-xl border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer font-extrabold text-slate-900">
                              Konkrete Einsatzzuweisungen ({activeVisitAssignments.length})
                            </summary>
                            <div className="mt-4 grid gap-3">
                              {activeVisitAssignments.map((assignment) => {
                                const visit = visitById.get(assignment.visit_id);
                                if (!visit) return null;
                                return (
                                  <form
                                    key={assignment.visit_id}
                                    action={assignEquipmentVisitAction}
                                    className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"
                                  >
                                    <input type="hidden" name="equipmentId" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="visitId"
                                      value={assignment.visit_id}
                                    />
                                    <p className="font-bold text-slate-900 sm:col-span-2">
                                      {visitLabel(visit)}
                                    </p>
                                    <Field label="Benötigte Menge">
                                      <input
                                        name="requiredQuantity"
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        required
                                        defaultValue={assignment.required_quantity}
                                        className={inputClass}
                                      />
                                    </Field>
                                    <label className="flex min-h-11 items-center gap-2 self-end rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                                      <input
                                        type="checkbox"
                                        name="rental"
                                        defaultChecked={assignment.rental}
                                      />
                                      Mietequipment
                                    </label>
                                    <label className="block sm:col-span-2">
                                      <span className="text-sm font-bold text-slate-800">
                                        Bereitstellungshinweis
                                      </span>
                                      <textarea
                                        name="provisionNote"
                                        rows={2}
                                        maxLength={2_000}
                                        defaultValue={assignment.provision_note || ""}
                                        className={inputClass}
                                      />
                                    </label>
                                    {item.status === "active" ? (
                                      <button className={buttonClass}>Aktualisieren</button>
                                    ) : (
                                      <span className="self-center text-xs text-slate-500">
                                        Archivierte Geräte können nur entfernt werden.
                                      </span>
                                    )}
                                    <button
                                      formAction={removeEquipmentVisitAction}
                                      className="min-h-11 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50"
                                    >
                                      Aus Einsatz entfernen
                                    </button>
                                  </form>
                                );
                              })}

                              {item.status === "active" ? (
                                availableVisits.length ? (
                                  <form
                                    action={assignEquipmentVisitAction}
                                    className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-2"
                                  >
                                    <input type="hidden" name="equipmentId" value={item.id} />
                                    <label className="block sm:col-span-2">
                                      <span className="text-sm font-bold text-slate-800">
                                        Geplanten oder laufenden Einsatz auswählen
                                      </span>
                                      <select
                                        name="visitId"
                                        required
                                        defaultValue=""
                                        className={inputClass}
                                      >
                                        <option value="" disabled>
                                          Bitte auswählen
                                        </option>
                                        {availableVisits.map((visit) => (
                                          <option key={visit.id} value={visit.id}>
                                            {visitLabel(visit)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <Field label="Benötigte Menge">
                                      <input
                                        name="requiredQuantity"
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        defaultValue="1"
                                        required
                                        className={inputClass}
                                      />
                                    </Field>
                                    <label className="flex min-h-11 items-center gap-2 self-end rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                                      <input type="checkbox" name="rental" /> Mietequipment
                                    </label>
                                    <label className="block sm:col-span-2">
                                      <span className="text-sm font-bold text-slate-800">
                                        Abhol- oder Bereitstellungshinweis
                                      </span>
                                      <textarea
                                        name="provisionNote"
                                        rows={2}
                                        maxLength={2_000}
                                        className={inputClass}
                                      />
                                    </label>
                                    <button className={`${buttonClass} sm:col-span-2`}>
                                      Einsatz zuordnen
                                    </button>
                                  </form>
                                ) : (
                                  <p className="text-sm text-slate-600">
                                    Kein weiterer offener Einsatz ist verfügbar.
                                  </p>
                                )
                              ) : null}
                            </div>
                          </details>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <PaginationNav
                  pathname="/admin/equipment"
                  query={{
                    q: queryValue(params, "q"),
                    category,
                    condition,
                    catalogStatus,
                    sort,
                  }}
                  page={equipmentPage.page}
                  totalPages={equipmentPage.totalPages}
                  totalItems={equipmentPage.totalItems}
                />
              </>
            ) : (
              <EmptyState
                title="Kein Equipment gefunden"
                text="Passen Sie die Filter an oder legen Sie den ersten Eintrag an."
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
