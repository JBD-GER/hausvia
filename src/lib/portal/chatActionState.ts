export type PropertyMessageActionState = {
  status: "idle" | "success" | "error";
  message: string;
  submissionId: number;
};

export type SendPropertyMessageAction = (
  previousState: PropertyMessageActionState,
  formData: FormData,
) => Promise<PropertyMessageActionState>;

export const INITIAL_PROPERTY_MESSAGE_ACTION_STATE: PropertyMessageActionState = {
  status: "idle",
  message: "",
  submissionId: 0,
};

function safeSubmissionId(state: PropertyMessageActionState) {
  return Number.isSafeInteger(state.submissionId) && state.submissionId >= 0
    ? state.submissionId
    : 0;
}

export function propertyMessageActionError(
  previousState: PropertyMessageActionState,
  message: string,
): PropertyMessageActionState {
  return {
    status: "error",
    message,
    submissionId: safeSubmissionId(previousState),
  };
}

export function propertyMessageActionSuccess(
  previousState: PropertyMessageActionState,
): PropertyMessageActionState {
  const previousSubmissionId = safeSubmissionId(previousState);
  return {
    status: "success",
    message: "Nachricht wurde gesendet.",
    submissionId:
      previousSubmissionId >= Number.MAX_SAFE_INTEGER
        ? 1
        : previousSubmissionId + 1,
  };
}
