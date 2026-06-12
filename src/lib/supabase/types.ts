export type AppRole = "admin" | "employee" | "customer";
export type ProfileStatus = "invited" | "active" | "disabled";
export type CustomerStatus = "lead" | "active" | "inactive" | "archived";
export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";
export type ShiftStatus = "open" | "submitted" | "approved" | "rejected";
export type MaterialRequestStatus = "requested" | "approved" | "ordered" | "delivered" | "rejected" | "canceled";
export type OfferStatus = "draft" | "released" | "accepted" | "rejected" | "expired" | "archived";
export type InvoiceStatus = "draft" | "released" | "open" | "paid" | "overdue" | "canceled";

export type UserProfile = {
  id: string;
  role: AppRole;
  email: string;
  full_name: string;
  phone: string | null;
  status: ProfileStatus;
  onboarding_completed: boolean;
};

export type PortalSummary = {
  profile: UserProfile;
  redirectPath: string;
};
