"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateBreakMinutes, calculateNetMinutes, minutesBetween } from "@/lib/breaks";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function required(value: string, fallback = "/app?error=missing") {
  if (!value) redirect(fallback);
  return value;
}

export async function startShiftAction(formData: FormData) {
  const profile = await requireProfile(["employee"]);
  const projectId = required(text(formData, "projectId"), "/app/shifts?error=project");
  const customerId = required(text(formData, "customerId"), "/app/shifts?error=customer");
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employee_profiles").select("id").eq("user_id", profile.id).single();

  if (!employee?.id) redirect("/app?error=employee");

  const { data: shift } = await supabase
    .from("shifts")
    .insert({
      customer_id: customerId,
      project_id: projectId,
      employee_id: employee.id,
      user_id: profile.id,
      started_at: new Date().toISOString(),
      status: "open",
    })
    .select("id")
    .single();

  revalidatePath("/app/shifts");
  redirect(`/app/shifts?shift=${shift?.id ?? ""}`);
}

export async function submitShiftAction(formData: FormData) {
  const profile = await requireProfile(["employee"]);
  const shiftId = required(text(formData, "shiftId"), "/app/shifts?error=shift");
  const startedAtRaw = required(text(formData, "startedAt"), "/app/shifts?error=start");
  const endedAtRaw = text(formData, "endedAt") || new Date().toISOString();
  const startedAt = new Date(startedAtRaw);
  const endedAt = new Date(endedAtRaw);
  const grossMinutes = minutesBetween(startedAt, endedAt);
  const breakMinutes = calculateBreakMinutes(grossMinutes);
  const netMinutes = calculateNetMinutes(grossMinutes);
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("shifts")
    .update({
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      gross_minutes: grossMinutes,
      break_minutes: breakMinutes,
      net_minutes: netMinutes,
      notes: text(formData, "notes"),
      status: "submitted",
    })
    .eq("id", shiftId)
    .eq("user_id", profile.id);

  const taskIds = formData.getAll("taskId").map((value) => String(value));
  await Promise.all(
    taskIds.map((taskId) =>
      supabase.from("shift_tasks").upsert({
        shift_id: shiftId,
        task_id: taskId,
        done: true,
      }),
    ),
  );

  revalidatePath("/app/shifts");
  redirect("/app/shifts?status=submitted");
}

export async function createMaterialRequestAction(formData: FormData) {
  const profile = await requireProfile(["employee"]);
  const projectId = required(text(formData, "projectId"), "/app/orders?error=project");
  const customerId = required(text(formData, "customerId"), "/app/orders?error=customer");
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employee_profiles").select("id").eq("user_id", profile.id).single();
  if (!employee?.id) redirect("/app/orders?error=employee");

  await supabase.from("material_requests").insert({
    customer_id: customerId,
    project_id: projectId,
    employee_id: employee.id,
    user_id: profile.id,
    title: required(text(formData, "title"), "/app/orders?error=title"),
    category: text(formData, "category") || "sonstiges Material",
    quantity: Number(text(formData, "quantity") || "1"),
    unit: text(formData, "unit"),
    note: text(formData, "note"),
  });

  revalidatePath("/app/orders");
  redirect("/app/orders?status=requested");
}
