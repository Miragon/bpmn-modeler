import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    initResizer,
    LogErrorCommand,
    type PropertiesPanelHandle,
    readSavedPanelVisibility,
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
    /** Already applied; `undefined` leaves the panel to the host's global default. */
    savedPanelVisible: boolean | undefined;
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

    // Before the import, so the panel never flashes the stale default baked into the
    // shell; through the handle, so the resizer's DOM-seeded collapse state follows.
    const savedPanelVisible = readSavedPanelVisibility(host);
    if (savedPanelVisible !== undefined) {
        panel.setVisible(savedPanelVisible);
    }

    return { canvas, panelHost, stripEl, panelMount, panel, savedPanelVisible };
}
