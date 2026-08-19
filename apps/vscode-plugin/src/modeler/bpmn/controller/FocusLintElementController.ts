import { commands, ExtensionContext, Uri } from "vscode";

import { BPMN_VIEW_TYPE, EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { FocusElementQuery } from "@miragon/bpmn-modeler-shared";

import { VsCodeNotifier } from "../../../shared/infrastructure/VsCodeNotifier";

// VS Code command ID behind a bpmnlint diagnostic's clickable code link.
export const FOCUS_LINT_ELEMENT_CMD = "bpmn-modeler.focusLintElement";

/**
 * Centres the BPMN canvas on the element behind a bpmnlint Problems-panel
 * finding. VS Code strips the range for custom editors and fires no diagnostic-
 * click event, so each element-specific diagnostic carries a `command:` link to
 * {@link FOCUS_LINT_ELEMENT_CMD} instead; this activates the editor and asks the
 * webview to centre the element. Hidden from the palette (only invoked via link).
 */
export class FocusLintElementController {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: VsCodeNotifier,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(FOCUS_LINT_ELEMENT_CMD, this.focus, this),
        );
    }

    // `editorId` is the document URI string — the store key editors register
    // under, which the diagnostics were published against.
    private async focus(editorId: string, elementId: string): Promise<void> {
        try {
            // Idempotent: reveals the open editor, or opens it if none yet.
            await commands.executeCommand("vscode.openWith", Uri.parse(editorId), BPMN_VIEW_TYPE);
            await this.editorStore.postMessage(editorId, new FocusElementQuery(elementId));
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
