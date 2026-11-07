import "../../../../packages/bpmn-modeler/src/styles/default.css";
import "./orcaEditor.css";

import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import { applyPageThemeScope } from "@miragon/bpmn-modeler-shared";

import { createDmnCanvas } from "../adapter/out/dmnCanvas";
import {
    currentOrcaTheme,
    followOrcaTheme,
    openOrcaSession,
    orcaLanguage,
} from "../adapter/out/orcaFrame";
import { syncDocument, type DocumentSync } from "../service/documentSync";
import { mountEditorLayout } from "./editorLayout";

/**
 * The DMN modeler has no read-only mode, so a read-only tab is shown but takes
 * no input: an edit there would silently get lost.
 */
function lockReadOnly(root: HTMLElement): void {
    root.querySelector("#js-drop-zone")!.setAttribute("inert", "");
    const notice = document.createElement("div");
    notice.className = "orca-read-only-notice";
    notice.textContent = i18n.translate("Read-only");
    root.append(notice);
}

/** Opens the tab's `.dmn` file in the DMN modeler, kept in step with Orca's document. */
export async function startDmnEditor(root: HTMLElement): Promise<DocumentSync> {
    i18n.extend(extras);
    i18n.setLanguage(orcaLanguage() as SupportedLocale);
    const session = await openOrcaSession();
    const layout = mountEditorLayout(root, "dmn");
    if (session.readOnly) lockReadOnly(root);

    const canvas = await createDmnCanvas({
        container: layout.canvas,
        panelParent: layout.panelMount,
        theme: currentOrcaTheme(),
        // dmn-js-properties-panel renders only for the DRD.
        onViewChanged: (view) => layout.hidePanel(view?.type !== "drd"),
    });
    followOrcaTheme((theme) => {
        applyPageThemeScope("data-dmn-theme", theme);
        canvas.setTheme(theme);
    });
    return syncDocument(session, canvas);
}
