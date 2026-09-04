import type { DemoMode } from "./modeModel";

const MODE_PARAM = "mode";

/** Reads the raw `?mode=` value (unvalidated — {@link resolveInitialMode} vets it). */
export function readRequestedMode(): string | null {
    return new URLSearchParams(window.location.search).get(MODE_PARAM);
}

/**
 * Reflects the applied mode into the URL without a navigation or history entry,
 * so a reload / shared link reopens in the same mode.
 */
export function writeModeToUrl(mode: DemoMode): void {
    const url = new URL(window.location.href);
    url.searchParams.set(MODE_PARAM, mode);
    window.history.replaceState(window.history.state, "", url);
}
