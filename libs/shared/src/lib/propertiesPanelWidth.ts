/**
 * Narrowest width (px) a drag renders the open panel at, and the width a
 * collapsed panel reappears at when dragged open.
 */
export const MIN_PANEL_WIDTH = 200;
export const MAX_PANEL_WIDTH = 1600;
export const DEFAULT_OPEN_PANEL_WIDTH = MIN_PANEL_WIDTH * 2;

function clampPanelWidth(width: number): number {
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
}

/** Webview state is untyped storage, so a saved width is only trusted once it is a usable number. */
export function restorablePanelWidth(saved: number | undefined): number | undefined {
    return saved !== undefined && Number.isFinite(saved) ? clampPanelWidth(saved) : undefined;
}
