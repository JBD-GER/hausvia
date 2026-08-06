"use client";

import { PortalErrorState } from "@/components/portal/PortalErrorState";

export default function EmployeePortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PortalErrorState error={error} reset={reset} portalLabel="Mitarbeiter-App" />;
}
