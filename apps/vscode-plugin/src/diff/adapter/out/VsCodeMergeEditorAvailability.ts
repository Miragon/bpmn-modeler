import { commands, env } from "vscode";

import { hostRunsElementXmlMergeEditor, MergeEditorAvailability } from "@miragon/bpmn-modeler-core";

import { OPEN_MERGE_EDITOR } from "./VsCodeElementXmlMergeEditor";

/**
 * Whether this host opens the element XML merge editor: only the unfiltered
 * command list shows VS Code's internal merge editor command, and the core
 * rules out the hosts that list it without running it.
 */
export class VsCodeMergeEditorAvailability implements MergeEditorAvailability {
    readonly ready: Promise<boolean>;

    constructor() {
        this.ready = Promise.resolve()
            .then(() => commands.getCommands(false))
            .then(
                (listed) =>
                    hostRunsElementXmlMergeEditor({
                        appName: env.appName,
                        uriScheme: env.uriScheme,
                        listsMergeEditor: listed.includes(OPEN_MERGE_EDITOR),
                    }),
                () => false,
            );
    }
}
