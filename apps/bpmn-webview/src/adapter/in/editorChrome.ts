import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    createWebviewStateStore,
    LogErrorCommand,
    mountPanelChrome,
    type PanelChrome,
    SetPropertiesPanelStateCommand,
    type WebviewStateHost,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../../port/webviewState";
import type { HostChannel } from "../../port/hostChannel";

export interface EditorChrome extends PanelChrome {
    stripEl: HTMLElement;
    /** Opens the panel shortcuts once the editor's surface is ready for them. */
    enableShortcuts(): void;
}

export interface EditorChromeFocus {
    focusCanvas: () => void;
    isCanvasFocused: () => boolean;
}

/**
 * Every shell ships an empty `#app`, so the page, the mode strip and the panel
 * are built here. `undefined`, reported to the host, when the page lacks it.
 */
export function mountEditorChrome(
    host: HostChannel & WebviewStateHost<WebviewState>,
    focus: EditorChromeFocus,
): EditorChrome | undefined {
    const root = document.getElementById("app");
    if (!root) {
        host.postMessage(new LogErrorCommand("Missing #app in host HTML"));
        return undefined;
    }

    let shortcutsEnabled = false;
    // Bound with the resizer, so the saved visibility shows before the import and a
    // toggle while the editor opens is already remembered and reported.
    const chrome = mountPanelChrome(root, {
        store: createWebviewStateStore(host),
        onVisibilityChosen: (visible) =>
            host.postMessage(new SetPropertiesPanelStateCommand(visible)),
        translate: (key) => i18n.translate(key),
        onLanguageChange: (apply) => i18n.onChange(apply),
        ...focus,
        isEnabled: () => shortcutsEnabled,
    });

    chrome.panelHost.classList.add("panel-host");
    const stripEl = document.createElement("div");
    stripEl.id = "js-mode-strip";
    stripEl.className = "mode-strip";
    chrome.canvas.prepend(stripEl);

    return {
        ...chrome,
        stripEl,
        enableShortcuts: () => {
            shortcutsEnabled = true;
        },
    };
}
