import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    bindPanelVisibility,
    bindPanelWidth,
    initResizer,
    type PropertiesPanelHandle,
} from "@miragon/bpmn-modeler-shared";

import { localPanelState } from "../adapter/out/localPanelState";

export interface EditorLayout {
    canvas: HTMLElement;
    /** The resizer collapses it; BPMN's mode strip marks its state on it. */
    panelHost: HTMLElement;
    panelMount: HTMLElement;
    panel: PropertiesPanelHandle;
    hidePanel(hidden: boolean): void;
}

/** The canvas, the resizer and the properties panel, with the ids the shared resizer binds to. */
export function mountEditorLayout(root: HTMLElement, editorKind: "bpmn" | "dmn"): EditorLayout {
    root.innerHTML = `
        <div class="content with-diagram" id="js-drop-zone">
            <div class="canvas" id="js-canvas"></div>
            <div class="panel-resizer" id="js-panel-resizer"></div>
            <div class="properties-panel-parent" id="js-properties-panel">
                <div class="panel-mount" id="js-properties-panel-mount"></div>
            </div>
        </div>`;
    const panel = initResizer({
        getToggleLabel: (state) =>
            i18n.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ) + " (Shift+P)",
        onLabelChange: (apply) => i18n.onChange(apply),
    });
    const store = localPanelState(`miragon.bpmnModeler.${editorKind}.panel`);
    bindPanelWidth(panel, store);
    bindPanelVisibility(panel, store, () => undefined).hostDefaultSettled(undefined);
    const panelHost = root.querySelector<HTMLElement>("#js-properties-panel")!;
    const resizer = root.querySelector<HTMLElement>("#js-panel-resizer")!;
    return {
        canvas: root.querySelector<HTMLElement>("#js-canvas")!,
        panelHost,
        panelMount: root.querySelector<HTMLElement>("#js-properties-panel-mount")!,
        panel,
        hidePanel(hidden) {
            panelHost.hidden = hidden;
            resizer.hidden = hidden;
        },
    };
}
