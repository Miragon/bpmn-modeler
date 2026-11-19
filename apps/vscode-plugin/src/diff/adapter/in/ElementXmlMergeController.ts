import { commands, ExtensionContext } from "vscode";

export const ACCEPT_ELEMENT_XML_MERGE = "bpmn-modeler.acceptElementXmlMerge";

/**
 * The element XML merge editor's title button. The merge editor's own result
 * menus are proposed API and the Git extension's Complete Merge serves only
 * its own files, so the button runs the editor's accept. Its result says
 * nothing: the user may cancel the editor's second dialog after it reported
 * success, so the merge finishes only when its tab closes.
 */
export class ElementXmlMergeController {
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(ACCEPT_ELEMENT_XML_MERGE, () => this.accept()),
        );
    }

    private async accept(): Promise<void> {
        await Promise.resolve(commands.executeCommand("mergeEditor.acceptMerge")).catch(
            () => undefined,
        );
    }
}
