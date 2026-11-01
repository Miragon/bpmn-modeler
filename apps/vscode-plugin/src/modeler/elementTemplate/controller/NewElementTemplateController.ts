import { posix } from "node:path";

import { commands, ExtensionContext, Uri, window, workspace } from "vscode";

import {
    elementTemplateEnginePrompt,
    newElementTemplate,
    NotifierPort,
    PickerPort,
    SettingsPort,
} from "@miragon/bpmn-modeler-core";
import { promptNewFileTarget } from "../../../shared/infrastructure/newFileTarget";

export const NEW_ELEMENT_TEMPLATE_CMD = "bpmn-modeler.newElementTemplate";
const TEMPLATE_FOLDER = "element-templates";

/**
 * Scaffolds an element template for either engine and opens its JSON, which
 * brings up the preview beside it. Like a new BPMN model, the engine is chosen
 * after the file is named, and nothing is written until both are known.
 */
export class NewElementTemplateController {
    constructor(
        private readonly picker: PickerPort,
        private readonly settings: Pick<SettingsPort, "getConfigFolder">,
        private readonly notifier: NotifierPort,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(NEW_ELEMENT_TEMPLATE_CMD, this.newElementTemplate, this),
        );
    }

    async newElementTemplate(): Promise<void> {
        try {
            const target = await promptNewFileTarget({
                title: "New Element Template",
                filterLabel: "Element Template",
                extension: "json",
                defaultUri: await this.defaultTarget(),
            });
            if (!target) {
                return;
            }
            const engine = await this.picker.choose(elementTemplateEnginePrompt());
            if (engine === undefined) {
                return;
            }
            const text = newElementTemplate(engine, posix.basename(target.path));
            await workspace.fs.writeFile(target, Buffer.from(text));
            await window.showTextDocument(target);
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * The template folder the chooser loads from at the workspace root. It is
     * created up front: the native dialogs open some other folder when the
     * default one is missing, and an empty template folder is a cheaper
     * leftover than a template saved where the chooser never finds it.
     */
    private async defaultTarget(): Promise<Uri | undefined> {
        const root = workspace.workspaceFolders?.[0];
        if (!root) {
            return undefined;
        }
        const folder = Uri.joinPath(root.uri, this.settings.getConfigFolder(), TEMPLATE_FOLDER);
        await workspace.fs.createDirectory(folder);
        return Uri.joinPath(folder, "new-element-template.json");
    }
}
