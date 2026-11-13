import "../../../../libs/shared/src/lib/panelChrome.css";
import "./orcaEditor.css";

import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import { applyPageThemeScope } from "@miragon/bpmn-modeler-shared";

import { createDmnCanvas, type DmnCanvas } from "../adapter/out/dmnCanvas";
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
function lockReadOnly(root: HTMLElement, dropZone: HTMLElement): void {
    dropZone.setAttribute("inert", "");
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
    // The shortcuts can fire before the canvas exists.
    const shortcuts: { target?: DmnCanvas } = {};
    const layout = mountEditorLayout(root, "dmn", {
        focusCanvas: () => shortcuts.target?.focusCanvas(),
        isCanvasFocused: () => shortcuts.target?.isCanvasFocused() ?? false,
        isEnabled: () => shortcuts.target?.isDrdViewActive() ?? false,
        escapeToCanvas: true,
    });
    if (session.readOnly) lockReadOnly(root, layout.dropZone);

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
    shortcuts.target = canvas;
    return syncDocument(session, canvas);
}
