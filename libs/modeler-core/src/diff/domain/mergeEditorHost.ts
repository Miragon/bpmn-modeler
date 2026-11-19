/** What `env.appName` reports in the standalone app: its Theia `applicationName`. */
export const STANDALONE_APP_NAME = "Miragon BPMN Modeler";

/** What a host says of itself where the merge editor would open. */
export interface MergeEditorHost {
    readonly appName: string;
    readonly uriScheme: string;
    /** The unfiltered command list holds VS Code's internal merge editor command. */
    readonly listsMergeEditor: boolean;
}

// Theia's default `electron.uriScheme`, which the standalone app keeps.
const THEIA_URI_SCHEME = "theia";

/**
 * Whether the element XML merge editor opens on the host: the internal
 * command is there, and the host is no Theia app, whose tab API reports the
 * merge editor's inputs swapped and which never ran the editor.
 */
export function hostRunsElementXmlMergeEditor(host: MergeEditorHost): boolean {
    return (
        host.listsMergeEditor &&
        host.appName !== STANDALONE_APP_NAME &&
        host.uriScheme !== THEIA_URI_SCHEME
    );
}
