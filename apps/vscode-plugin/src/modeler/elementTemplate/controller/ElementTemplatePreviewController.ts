import {
    commands,
    ExtensionContext,
    TextDocument,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import { ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE, NotifierPort } from "@miragon/bpmn-modeler-core";
import { isElementTemplateText } from "@miragon/bpmn-modeler-types";

export const OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD = "bpmn-modeler.openElementTemplatePreview";
const IS_ELEMENT_TEMPLATE_KEY = "bpmn-modeler.isElementTemplate";
const RECHECK_DELAY_MS = 300;

/**
 * Opens the template preview beside a JSON editor, and marks JSON editors whose
 * `$schema` names a template so the editor title offers it. The manifest also
 * offers it under an `element-templates` folder, which needs no activation.
 */
export class ElementTemplatePreviewController {
    private pendingRecheck: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly notifier: NotifierPort) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD, (uri?: Uri) =>
                this.openPreview(uri),
            ),
            window.onDidChangeActiveTextEditor(() => this.updateContextKey()),
            workspace.onDidChangeTextDocument((event) => {
                if (event.document === window.activeTextEditor?.document) {
                    clearTimeout(this.pendingRecheck);
                    this.pendingRecheck = setTimeout(
                        () => this.updateContextKey(),
                        RECHECK_DELAY_MS,
                    );
                }
            }),
            { dispose: () => clearTimeout(this.pendingRecheck) },
        );
        this.updateContextKey();
    }

    private async openPreview(uri: Uri | undefined): Promise<void> {
        const target = uri ?? window.activeTextEditor?.document.uri;
        if (!target) {
            this.notifier.showInfo("Open an element template file to preview it.");
            return;
        }
        await commands.executeCommand(
            "vscode.openWith",
            target,
            ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
            {
                viewColumn: ViewColumn.Beside,
                preserveFocus: true,
            },
        );
    }

    private updateContextKey(): void {
        void commands.executeCommand(
            "setContext",
            IS_ELEMENT_TEMPLATE_KEY,
            isTemplateDocument(window.activeTextEditor?.document),
        );
    }
}

function isTemplateDocument(document: TextDocument | undefined): boolean {
    return (
        document !== undefined &&
        document.fileName.endsWith(".json") &&
        isElementTemplateText(document.getText())
    );
}
