import "server-only";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdminContext() {
  const profile = await requireProfile(["admin"]);
  const supabase = await createSupabaseServerClient();
  return { profile, supabase, admin: createSupabaseAdminClient() };
}

export async function requireEmployeeContext() {
  const profile = await requireProfile(["employee"]);
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase
    .from("employee_profiles")
    .select("id,user_id,first_name,last_name,full_name")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!employee) redirect("/login?status=missing-profile");
  return { profile, employee, supabase };
}

export async function requireCustomerContext() {
  const profile = await requireProfile(["customer"]);
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from("customer_users")
    .select("customer_id,customers(id,status,company_name,contact_name)")
    .eq("user_id", profile.id)
    .eq("active", true)
    .maybeSingle();

  if (membership?.customer_id) {
    return { profile, customerId: membership.customer_id, customer: membership.customers, supabase };
  }

  const { data: legacyCustomer } = await supabase
    .from("customers")
    .select("id,status,company_name,contact_name")
    .eq("portal_user_id", profile.id)
    .maybeSingle();
  if (!legacyCustomer) redirect("/portal?status=missing-customer");
  return { profile, customerId: legacyCustomer.id, customer: legacyCustomer, supabase };
}

export async function canAccessProperty(propertyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("properties").select("id").eq("id", propertyId).maybeSingle();
  return Boolean(data?.id);
}

export function ensureDatabaseResult(error: { message?: string } | null, fallback: string): asserts error is null {
  if (error) {
    console.error(`[Hausvia Portal] ${fallback}`, error.message ?? error);
    throw new Error(fallback);
  }
}
