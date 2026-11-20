import type { FormPreviewResult } from "@miragon/bpmn-modeler-types";

type FormPreviewUnavailableReason = Extract<FormPreviewResult, { kind: "unavailable" }>["reason"];

export const FORM_PREVIEW_TEXTS = {
    title: "Linked form preview",
    refresh: "Refresh",
    close: "Close form preview",
    description: "Read-only preview of the saved local form.",
    loaded: "Saved form loaded.",
    referenceBroken: "The linked form is missing or invalid. Check the form reference.",
    invalidForm: "The saved form is invalid or unsupported. Open it in the form editor.",
    viewerFailed: "The form preview could not be loaded. Refresh to try again.",
} as const;

/** Why the host found no form to preview, as the preview's status says it. */
export const FORM_PREVIEW_UNAVAILABLE_TEXTS: Readonly<
    Record<FormPreviewUnavailableReason, string>
> = {
    noScope: "Open a workspace folder to preview linked forms.",
    notFound: "No saved local form matches this reference. Refresh to try again.",
    ambiguous: "Multiple saved forms match this reference. Choose a form to preview.",
    unreadable: "The saved form could not be read. Refresh to try again.",
    timeout: "The host did not answer. Refresh to try again.",
};

/** Every key the linked form preview passes to translate(). */
export const FORM_PREVIEW_KEYS: readonly string[] = [
    ...Object.values(FORM_PREVIEW_TEXTS),
    ...Object.values(FORM_PREVIEW_UNAVAILABLE_TEXTS),
];
