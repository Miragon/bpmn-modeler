import {
    commands,
    ExtensionContext,
    Tab,
    TabInputCustom,
    TabInputText,
    TabInputTextDiff,
    TextEditor,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import {
    ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
    NotifierPort,
    SettingsPort,
    ShownTemplate,
    TemplatePreviewAutoOpen,
} from "@miragon/bpmn-modeler-core";
import { isElementTemplateFile } from "@miragon/bpmn-modeler-types";

export const OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD = "bpmn-modeler.openElementTemplatePreview";
const IS_ELEMENT_TEMPLATE_KEY = "bpmn-modeler.isElementTemplate";
const RECHECK_DELAY_MS = 300;

/**
 * Opens the template preview beside a template's JSON editor: on its own the
 * first time the file is shown, or by command. Closing the preview keeps it
 * closed until the file is opened again. Also marks template editors so the
 * editor title offers the command.
 */
export class ElementTemplatePreviewController {
    private pendingRecheck: ReturnType<typeof setTimeout> | undefined;
    private readonly autoOpen = new TemplatePreviewAutoOpen();

    constructor(
        private readonly notifier: NotifierPort,
        private readonly settings: Pick<SettingsPort, "getConfigFolder">,
        private readonly openAutomatically: () => boolean,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD, (uri?: Uri) =>
                this.openPreview(uri),
            ),
            window.onDidChangeActiveTextEditor((editor) => this.onActiveEditor(editor)),
            workspace.onDidChangeTextDocument((event) => {
                if (event.document === window.activeTextEditor?.document) {
                    clearTimeout(this.pendingRecheck);
                    this.pendingRecheck = setTimeout(
                        () => this.onActiveEditor(window.activeTextEditor),
                        RECHECK_DELAY_MS,
                    );
                }
            }),
            window.tabGroups.onDidChangeTabs(({ closed }) => this.forgetClosedFiles(closed)),
            { dispose: () => clearTimeout(this.pendingRecheck) },
        );
        this.onActiveEditor(window.activeTextEditor);
    }

    private onActiveEditor(editor: TextEditor | undefined): void {
        const isTemplate =
            editor !== undefined &&
            isElementTemplateFile(
                editor.document.fileName,
                editor.document.getText(),
                this.settings.getConfigFolder(),
            );
        void commands.executeCommand("setContext", IS_ELEMENT_TEMPLATE_KEY, isTemplate);
        if (isTemplate && this.autoOpen.onShown(this.factsOf(editor)) === "open") {
            void this.openPreview(editor.document.uri);
        }
    }

    private factsOf(editor: TextEditor): ShownTemplate {
        const { uri } = editor.document;
        const file = uri.toString();
        return {
            file,
            isLocalFile: uri.scheme === "file",
            inEditorArea: editor.viewColumn !== undefined,
            isDiff: window.tabGroups.activeTabGroup.activeTab?.input instanceof TabInputTextDiff,
            enabled: this.openAutomatically(),
            hasPreview: this.hasPreview(file),
        };
    }

    private hasPreview(key: string): boolean {
        return this.openTabs().some(
            ({ input }) =>
                input instanceof TabInputCustom &&
                input.viewType === ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE &&
                input.uri.toString() === key,
        );
    }

    private forgetClosedFiles(closed: readonly Tab[]): void {
        const stillOpen = new Set(
            this.openTabs().flatMap(({ input }) =>
                input instanceof TabInputText ? [input.uri.toString()] : [],
            ),
        );
        for (const { input } of closed) {
            if (input instanceof TabInputText) {
                const file = input.uri.toString();
                this.autoOpen.onClosed(file, stillOpen.has(file));
            }
        }
    }

    private openTabs(): Tab[] {
        return window.tabGroups.all.flatMap((group) => group.tabs);
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
}
