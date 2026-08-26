/**
 * Neutral "open in editor" glyph (a square-pen / edit mark) as inline SVG.
 *
 * Used by both the script-task context pad entry
 * ({@link scriptTaskContextPad}) and the properties-panel "Open in editor"
 * buttons ({@link scriptEditorButtons}). The webview bundle is host-agnostic
 * (VS Code and IntelliJ ship the same one), so the mark must not be a VS Code
 * product logo. `currentColor` lets it inherit the button's themed text colour
 * on both hosts instead of a hard-coded brand blue.
 */
export const EDITOR_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
  <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
</svg>`;
