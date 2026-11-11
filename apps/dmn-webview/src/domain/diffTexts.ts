/** The DMN diff pane's own words, as i18n keys; the legend's count labels are the BPMN diff's. */
export const DIFF_TEXTS = {
    added: "Added",
    removed: "Removed",
    changed: "Changed",
    moved: "Moved",
    previous: "Prev change",
    next: "Next change",
    swap: "Swap sides",
    changes: "Changes",
    viewDrd: "View DRD",
    notInVersion: "Not in this version",
    removedHere: "It was removed. The version on the left shows it.",
    addedHere: "It is new. The version on the right shows it.",
} as const;
