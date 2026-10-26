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

const UNDECIDED: PanelVisibility = { decided: false };

function shown(visible: boolean): PanelVisibilityTransition {
    return { state: { decided: true, visible }, effects: [{ kind: "show", visible }] };
}

export function initialPanelVisibility(saved: boolean | undefined): PanelVisibilityTransition {
    return saved === undefined ? { state: UNDECIDED, effects: [] } : shown(saved);
}

export function panelVisibilityAfter(
    state: PanelVisibility,
    event: PanelVisibilityEvent,
): PanelVisibilityTransition {
    switch (event.kind) {
        case "userToggled":
            return {
                state: { decided: true, visible: event.visible },
                effects: [{ kind: "remember", visible: event.visible }],
            };
        case "hostDefaultSettled":
            return state.decided ? { state, effects: [] } : shown(event.visible ?? true);
    }
}

export interface PanelVisibilityBinding {
    isDecided(): boolean;
    hostDefaultSettled(visible: boolean | undefined): void;
}

/**
 * The resizer reports every transition without an origin, so only the binder's
 * own `show` is tagged; any other transition, Shift+P and `p` included, is the user's.
 */
export function bindPanelVisibility(
    handle: PropertiesPanelHandle,
    store: WebviewStateStore<PropertiesPanelUiState>,
    report: (visible: boolean) => void,
): PanelVisibilityBinding {
    let applying = false;
    const initial = initialPanelVisibility(store.read()?.panelVisible);
    let state = initial.state;

    function perform(effects: readonly PanelVisibilityEffect[]): void {
        for (const effect of effects) {
            if (effect.kind === "show") {
                applying = true;
                try {
                    handle.setVisible(effect.visible);
                } finally {
                    applying = false;
                }
            } else {
                store.merge({ panelVisible: effect.visible });
                report(effect.visible);
            }
        }
    }

    function dispatch(event: PanelVisibilityEvent): void {
        const next = panelVisibilityAfter(state, event);
        state = next.state;
        perform(next.effects);
    }

    handle.onVisibilityChanged((visible) => {
        if (!applying) {
            dispatch({ kind: "userToggled", visible });
        }
    });
    perform(initial.effects);

    return {
        isDecided: () => state.decided,
        hostDefaultSettled: (visible) => dispatch({ kind: "hostDefaultSettled", visible }),
    };
}
