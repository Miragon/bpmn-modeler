// The modeler's sheets load with the page: the viewer brings none, and a read-only tab loads only it.
import "../../../../packages/bpmn-modeler/src/styles/default.css";
import "../../../../packages/bpmn-modeler/src/styles/diff.css";
import "../../../../libs/modeler-types/src/canvasOverlays.css";
import "../../../../packages/bpmn-modeler/src/styles/themes.css";
import "../../../../packages/bpmn-modeler/src/styles/mode.css";
import "./orcaEditor.css";

import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import { applyPageThemeScope } from "@miragon/bpmn-modeler-shared";

import { createBpmnCanvas } from "../adapter/out/bpmnCanvas";
import {
    currentOrcaTheme,
    followOrcaTheme,
    openOrcaSession,
    orcaLanguage,
} from "../adapter/out/orcaFrame";
import { syncDocument, type DocumentSync } from "../service/documentSync";
import { mountEditorLayout } from "./editorLayout";

/** Opens the tab's `.bpmn` file in the mode session, kept in step with Orca's document. */
export async function startBpmnEditor(root: HTMLElement): Promise<DocumentSync> {
    i18n.extend(extras);
    i18n.setLanguage(orcaLanguage() as SupportedLocale);
    const session = await openOrcaSession();
    const layout = mountEditorLayout(root, "bpmn");
    layout.panelHost.classList.add("panel-host");
    const strip = document.createElement("div");
    strip.className = "mode-strip";
    layout.canvas.prepend(strip);

    const canvas = createBpmnCanvas({
        container: layout.canvas,
        panelParent: layout.panelMount,
        strip: { el: strip, host: layout.panelHost },
        readOnly: session.readOnly,
        theme: currentOrcaTheme(),
    });
    followOrcaTheme((theme) => {
        applyPageThemeScope("data-bpmn-theme", theme);
        canvas.setTheme(theme);
    });
    return syncDocument(session, canvas);
}
