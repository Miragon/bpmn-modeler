import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    mountPanelChrome,
    type PanelChrome,
    type PanelChromeOptions,
} from "@miragon/bpmn-modeler-shared";

import { localPanelState } from "../adapter/out/localPanelState";

export type EditorFocus = Pick<
    PanelChromeOptions,
    "focusCanvas" | "isCanvasFocused" | "isEnabled" | "escapeToCanvas"
>;

/** The canvas, the resizer and the properties panel, with the panel's state kept per editor kind. */
export function mountEditorLayout(
    root: HTMLElement,
    editorKind: "bpmn" | "dmn",
    focus: EditorFocus,
): PanelChrome {
    const chrome = mountPanelChrome(root, {
        store: localPanelState(`miragon.bpmnModeler.${editorKind}.panel`),
        translate: (key) => i18n.translate(key),
        onLanguageChange: (apply) => i18n.onChange(apply),
        ...focus,
    });
    // Orca keeps no default of its own, so the panel opens unless this editor kind saved otherwise.
    chrome.visibility.hostDefaultSettled(undefined);
    return chrome;
}
