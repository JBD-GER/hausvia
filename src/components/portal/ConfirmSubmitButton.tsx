"use client";

import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  confirmation: string;
  className?: string;
  pendingLabel?: string;
};

export function ConfirmSubmitButton({
  children,
  confirmation,
  className,
  pendingLabel = "Wird entfernt …",
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
