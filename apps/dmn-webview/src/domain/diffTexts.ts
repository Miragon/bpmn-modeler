import { DIFF_PLANE_MISSING_TEXT } from "@miragon/bpmn-modeler-types";

/** The DMN diff pane's own words, as i18n keys; the words every diff legend shows are `DIFF_LEGEND_TEXTS`. */
export const DMN_DIFF_TEXTS = {
    viewDrd: "View DRD",
    notInVersion: DIFF_PLANE_MISSING_TEXT,
    removedHere: "It was removed. The version on the left shows it.",
    addedHere: "It is new. The version on the right shows it.",
} as const;
