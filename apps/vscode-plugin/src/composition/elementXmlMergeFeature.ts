import { ExtensionContext, workspace } from "vscode";

import {
    ElementXmlMergeService,
    MergeDecisionService,
    MergeEditorAvailability,
    MergeSessionStore,
} from "@miragon/bpmn-modeler-core";
import { ElementXmlMergeController } from "../diff/adapter/in/ElementXmlMergeController";
import {
    MERGE_RESULT_SCHEME,
    MERGE_XML_SCHEME,
    VsCodeElementXmlMergeEditor,
} from "../diff/adapter/out/VsCodeElementXmlMergeEditor";
import { InMemoryFileSystemProvider } from "../shared/adapter/in/InMemoryFileSystemProvider";
import { SharedDeps } from "./sharedDeps";

/**
 * The element XML merge editor: its files under `bpmn-merge-xml:` and
 * `bpmn-merge-result:`, VS Code's merge editor over them, its title button,
 * and the core service the merge panes reach it through, which the editor
 * hands each finished merge.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    merge: { readonly sessions: MergeSessionStore; readonly decisions: MergeDecisionService },
    availability: MergeEditorAvailability,
): ElementXmlMergeService {
    const inputs = new InMemoryFileSystemProvider({ readOnly: true });
    const results = new InMemoryFileSystemProvider({ editorMayCreateFiles: false });
    let service: ElementXmlMergeService | undefined = undefined;
    const editor = new VsCodeElementXmlMergeEditor(inputs, results, (key, written) => {
        service
            ?.finish(key, written)
            .catch((error: unknown) => deps.notifier.logError(error as Error));
    });
    editor.register(context);
    new ElementXmlMergeController().register(context);
    context.subscriptions.push(
        inputs,
        results,
        workspace.registerFileSystemProvider(MERGE_XML_SCHEME, inputs, {
            isCaseSensitive: true,
            isReadonly: true,
        }),
        workspace.registerFileSystemProvider(MERGE_RESULT_SCHEME, results, {
            isCaseSensitive: true,
        }),
    );
    service = new ElementXmlMergeService(
        merge.sessions,
        merge.decisions,
        editor,
        availability,
        deps.notifier,
    );
    return service;
}
