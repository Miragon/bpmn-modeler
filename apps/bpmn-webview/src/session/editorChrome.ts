import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    bindPanelVisibility,
    createWebviewStateStore,
    initResizer,
    LogErrorCommand,
    type PanelVisibilityBinding,
    type PropertiesPanelHandle,
    SetPropertiesPanelStateCommand,
    type WebviewStateHost,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../webviewState";
import type { HostChannel } from "./hostChannel";

export interface EditorChrome {
    canvas: HTMLElement;
    /** Carries the mode strip's state attributes; the resizer collapses it. */
    panelHost: HTMLElement;
    stripEl: HTMLElement;
    /** The properties-panel parent and the panel-shortcut root. */
    panelMount: HTMLElement;
    panel: PropertiesPanelHandle;
    panelVisibility: PanelVisibilityBinding;
}

/**
 * Every shell ships only the empty `#js-canvas` and `#js-properties-panel`, so
 * the mode strip and the panel mount are created here. `undefined`, reported to
 * the host, when the page lacks either.
 */
export function mountEditorChrome(
    host: HostChannel & WebviewStateHost<WebviewState>,
): EditorChrome | undefined {
    const canvas = document.getElementById("js-canvas");
    const panelHost = document.getElementById("js-properties-panel");
    if (!canvas || !panelHost) {
        host.postMessage(
            new LogErrorCommand("Missing #js-canvas or #js-properties-panel in host HTML"),
        );
        return undefined;
    }

    panelHost.classList.add("panel-host");
    const stripEl = document.createElement("div");
    stripEl.id = "js-mode-strip";
    stripEl.className = "mode-strip";
    const panelMount = document.createElement("div");
    panelMount.id = "js-properties-panel-mount";
    panelMount.className = "panel-mount";
    canvas.prepend(stripEl);
    panelHost.append(panelMount);

    // Binds to `#js-properties-panel` itself, so a collapse hides the mount with it.
    const panel = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ) + " (Shift+P)",
        onLabelChange: (apply) => i18n.onChange(apply),
    });

    // Bound with the resizer, so the saved visibility shows before the import and a
    // toggle while the editor opens is already remembered and reported.
    const panelVisibility = bindPanelVisibility(panel, createWebviewStateStore(host), (visible) =>
        host.postMessage(new SetPropertiesPanelStateCommand(visible)),
    );

    return { canvas, panelHost, stripEl, panelMount, panel, panelVisibility };
}
