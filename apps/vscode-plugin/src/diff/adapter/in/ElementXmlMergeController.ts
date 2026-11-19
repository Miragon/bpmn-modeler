import { commands, ExtensionContext } from "vscode";

export const ACCEPT_ELEMENT_XML_MERGE = "bpmn-modeler.acceptElementXmlMerge";

/** Marks the merge of the active tab as being accepted, until the returned call ends the mark. */
export type AcceptingActiveMerge = () => () => void;

/**
 * The element XML merge editor's title button. The merge editor's own result
 * menus are proposed API and the Git extension's Complete Merge serves only
 * its own files, so the button runs the editor's accept. Its result says
 * nothing: the user may cancel the editor's second dialog after it reported
 * success, so the merge finishes only when its tab closes. The merge is
 * marked as accepted while the command runs, since the accept's save writes
 * nothing for a result an auto-save already wrote.
 */
export class ElementXmlMergeController {
    constructor(private readonly acceptingActiveMerge: AcceptingActiveMerge) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(ACCEPT_ELEMENT_XML_MERGE, () => this.accept()),
        );
    }

    private async accept(): Promise<void> {
        const accepted = this.acceptingActiveMerge();
        try {
            await commands.executeCommand("mergeEditor.acceptMerge");
        } catch {
            // VS Code refuses an accept without a focused merge editor; the tab closing is the answer.
        } finally {
            accepted();
        }
    }
}
