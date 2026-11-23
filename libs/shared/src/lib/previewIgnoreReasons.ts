// Why more than one browser preview drops a command. Separate plain literals, not
// one object: a table's module-level property read, interpolation or
// concatenation keeps the table in the production bundle (`previewCommandTables.spec.ts`).
export const PREVIEW_NO_FILE_TO_WRITE_EDIT_TO = "the preview has no file to write an edit to";
export const PREVIEW_NO_FILE_TO_SAVE = "the preview has no file to save";
export const PREVIEW_OPENS_PANEL_THE_SAME_WAY = "the preview always opens the panel the same way";
export const PREVIEW_NO_PARTNER_PANE = "a single pane has no partner pane to follow it";
