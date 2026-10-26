import type { PropertiesPanelHandle } from "./propertiesPanelResizer";
import type { PropertiesPanelUiState } from "./propertiesPanelUiState";
import type { WebviewStateStore } from "./webviewStateStore";

export type PanelVisibility =
    { readonly decided: false } | { readonly decided: true; readonly visible: boolean };

export type PanelVisibilityEvent =
    | { readonly kind: "userToggled"; readonly visible: boolean }
    /** `visible` is `undefined` when the host never answered. */
    | { readonly kind: "hostDefaultSettled"; readonly visible: boolean | undefined };

export type PanelVisibilityEffect =
    /** Apply to the panel without treating it as a user decision. */
    | { readonly kind: "show"; readonly visible: boolean }
    /** Save for this editor and report to the host as the new default. */
    | { readonly kind: "remember"; readonly visible: boolean };

export interface PanelVisibilityTransition {
    readonly state: PanelVisibility;
    readonly effects: readonly PanelVisibilityEffect[];
}

export function initialPanelVisibility(_saved: boolean | undefined): PanelVisibilityTransition {
    return { state: { decided: false }, effects: [] };
}

export function panelVisibilityAfter(
    state: PanelVisibility,
    _event: PanelVisibilityEvent,
): PanelVisibilityTransition {
    return { state, effects: [] };
}

export interface PanelVisibilityBinding {
    isDecided(): boolean;
    hostDefaultSettled(visible: boolean | undefined): void;
}

export function bindPanelVisibility(
    _handle: PropertiesPanelHandle,
    _store: WebviewStateStore<PropertiesPanelUiState>,
    _report: (visible: boolean) => void,
): PanelVisibilityBinding {
    return { isDecided: () => false, hostDefaultSettled: () => undefined };
}
