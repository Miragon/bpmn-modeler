import {
    commands,
    ExtensionContext,
    TabInputCustom,
    TabInputText,
    TextEditor,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import { ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE, NotifierPort } from "@miragon/bpmn-modeler-core";
import { isElementTemplateFile } from "@miragon/bpmn-modeler-types";

export const OPEN_ELEMENT_TEMPLATE_EDITOR_CMD = "bpmn-modeler.openElementTemplateEditor";
export const TOGGLE_ELEMENT_TEMPLATE_JSON_CMD = "bpmn-modeler.toggleElementTemplateJson";
const IS_ELEMENT_TEMPLATE_KEY = "bpmn-modeler.isElementTemplate";
const RECHECK_DELAY_MS = 300;

/**
 * The commands around the element template editor: opening a JSON file in it,
 * and showing or hiding its JSON beside it, as the BPMN editor does with XML.
 * Also marks JSON editors that hold a template so their editor title offers
 * the editor; files in an `element-templates` folder open in it by default.
 */
export class ElementTemplateEditorController {
    private pendingRecheck: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly notifier: NotifierPort) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(OPEN_ELEMENT_TEMPLATE_EDITOR_CMD, (uri?: Uri) =>
                this.openInEditor(uri),
            ),
            commands.registerCommand(TOGGLE_ELEMENT_TEMPLATE_JSON_CMD, (uri?: Uri) =>
                this.toggleJson(uri),
            ),
            window.onDidChangeActiveTextEditor((editor) => this.updateContextKey(editor)),
            workspace.onDidChangeTextDocument((event) => {
                if (event.document === window.activeTextEditor?.document) {
                    clearTimeout(this.pendingRecheck);
                    this.pendingRecheck = setTimeout(
                        () => this.updateContextKey(window.activeTextEditor),
                        RECHECK_DELAY_MS,
                    );
                }
            }),
            { dispose: () => clearTimeout(this.pendingRecheck) },
        );
        this.updateContextKey(window.activeTextEditor);
    }

    private async openInEditor(uri: Uri | undefined): Promise<void> {
        const target = uri ?? window.activeTextEditor?.document.uri;
        if (!target) {
            this.notifier.showInfo("Open an element template file to edit it.");
            return;
        }
        await commands.executeCommand("vscode.openWith", target, ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE);
    }

    private async toggleJson(uri: Uri | undefined): Promise<void> {
        const target = uri ?? this.activeTemplateEditorUri();
        if (!target) {
            return;
        }
        const key = target.toString();
        const jsonTabs = window.tabGroups.all
            .flatMap((group) => group.tabs)
            .filter(({ input }) => input instanceof TabInputText && input.uri.toString() === key);
        if (jsonTabs.length > 0) {
            await window.tabGroups.close(jsonTabs);
            return;
        }
        await commands.executeCommand("vscode.openWith", target, "default", ViewColumn.Beside);
    }

    private activeTemplateEditorUri(): Uri | undefined {
        const input = window.tabGroups.activeTabGroup.activeTab?.input;
        return input instanceof TabInputCustom &&
            input.viewType === ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE
            ? input.uri
            : undefined;
    }

    private updateContextKey(editor: TextEditor | undefined): void {
        const isTemplate =
            editor !== undefined &&
            isElementTemplateFile(editor.document.fileName, editor.document.getText());
        void commands.executeCommand("setContext", IS_ELEMENT_TEMPLATE_KEY, isTemplate);
    }
}
