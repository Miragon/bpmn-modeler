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
    WorkspaceFolder,
} from "vscode";

import {
    DEFAULT_TEMPLATE_FILE_NAME,
    ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
    NotifierPort,
    SettingsPort,
    templateFileName,
} from "@miragon/bpmn-modeler-core";
import { ELEMENT_TEMPLATES_FOLDER, isElementTemplateFile } from "@miragon/bpmn-modeler-types";

export const OPEN_ELEMENT_TEMPLATE_EDITOR_CMD = "bpmn-modeler.openElementTemplateEditor";
export const TOGGLE_ELEMENT_TEMPLATE_JSON_CMD = "bpmn-modeler.toggleElementTemplateJson";
export const NEW_ELEMENT_TEMPLATE_CMD = "bpmn-modeler.newElementTemplate";
const IS_ELEMENT_TEMPLATE_KEY = "bpmn-modeler.isElementTemplate";
const RECHECK_DELAY_MS = 300;
const NEW_TEMPLATE_TITLE = "New Element Template";

/**
 * The commands around the element template editor: creating a template,
 * opening a JSON file in the editor, and showing or hiding its JSON beside it,
 * as the BPMN editor does with XML. Also marks JSON editors that hold a
 * template so their editor title offers the editor; files in an
 * `element-templates` folder open in it by default.
 */
export class ElementTemplateEditorController {
    private pendingRecheck: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly notifier: NotifierPort,
        private readonly settings: Pick<SettingsPort, "getConfigFolder">,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(NEW_ELEMENT_TEMPLATE_CMD, () => this.newTemplate()),
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

    /**
     * Writes an empty file and lets the editor's start form fill it in. Inside a
     * workspace the file goes where the modelers load templates from, so the
     * new template shows up in their template chooser.
     */
    private async newTemplate(): Promise<void> {
        try {
            const target = await this.newTemplateTarget();
            if (!target) {
                return;
            }
            await workspace.fs.writeFile(target, new Uint8Array());
            await commands.executeCommand(
                "vscode.openWith",
                target,
                ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            );
        } catch (error) {
            this.notifier.notifyError(
                "A problem occurred while creating the element template.",
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    private async newTemplateTarget(): Promise<Uri | undefined> {
        const folders = workspace.workspaceFolders ?? [];
        if (folders.length === 0) {
            return this.pickNewTemplateFile();
        }
        const root: WorkspaceFolder | undefined =
            folders.length === 1
                ? folders[0]
                : await window.showWorkspaceFolderPick({
                      placeHolder: "Workspace folder for the new element template",
                  });
        if (!root) {
            return undefined;
        }

        const folderLabel = `${this.settings.getConfigFolder()}/${ELEMENT_TEMPLATES_FOLDER}`;
        const folder = Uri.joinPath(root.uri, folderLabel);
        const taken = (fileName: string) => `${fileName} already exists in ${folderLabel}.`;
        const name = await window.showInputBox({
            title: NEW_TEMPLATE_TITLE,
            prompt: `The file goes into ${folderLabel}.`,
            value: DEFAULT_TEMPLATE_FILE_NAME,
            validateInput: async (input) => {
                const file = templateFileName(input);
                if (file.kind === "invalid") {
                    return file.message;
                }
                return (await exists(Uri.joinPath(folder, file.fileName)))
                    ? taken(file.fileName)
                    : undefined;
            },
        });
        const file = name === undefined ? undefined : templateFileName(name);
        if (file?.kind !== "valid") {
            return undefined;
        }

        const target = Uri.joinPath(folder, file.fileName);
        if (await exists(target)) {
            this.notifier.showInfo(taken(file.fileName));
            return undefined;
        }
        await workspace.fs.createDirectory(folder);
        return target;
    }

    private async pickNewTemplateFile(): Promise<Uri | undefined> {
        const uri = await window.showSaveDialog({
            title: NEW_TEMPLATE_TITLE,
            filters: { "Element Template": ["json"] },
        });
        if (!uri) {
            return undefined;
        }
        return uri.path.endsWith(".json") ? uri : uri.with({ path: `${uri.path}.json` });
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

async function exists(uri: Uri): Promise<boolean> {
    try {
        await workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}
