import { ActionNotice } from "../../kernel/domain/actionNotice";
import {
    ApprovableArtifact,
    ApprovalNoticeAction,
    ApprovalState,
    approvedArtifacts,
    CodeApproval,
    CodeApprovalOutcome,
    PendingCodeApproval,
} from "../../kernel/domain/codeApproval";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { relativeToWorkspace } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";

export {
    approvalOutcome,
    approvalsAllowing,
    approvalStateOf,
    declineKeyOf,
    pendingApprovals,
} from "../../kernel/domain/codeApproval";

/** A plugin found in a workspace's `<configFolder>/plugins/<folder>`; its id is that folder. */
export interface WorkspacePlugin extends ApprovableArtifact {
    readonly scriptPath: string;
    readonly stylePath?: string;
}

export type PluginApproval = CodeApproval;

export type PluginApprovalState = ApprovalState;

export type PendingApproval = PendingCodeApproval<WorkspacePlugin>;

export type ApprovalOutcome = CodeApprovalOutcome<WorkspacePlugin>;

export const approvedPlugins = approvedArtifacts;

export const PLUGIN_APPROVAL_PROMPT_ID = "bpmnPluginApproval";

const NO_STYLE = "-";

/**
 * What the content hash covers. Each text carries its length, so no bytes can
 * move between script and style, and a missing style differs from an empty one.
 */
export function approvedContent(script: string, style: string | undefined): string {
    const lengthPrefixed = (text: string) => `${text.length}:${text}`;
    return lengthPrefixed(script) + (style === undefined ? NO_STYLE : lengthPrefixed(style));
}

const STATE_DESCRIPTION: Record<PendingApproval["state"], string> = {
    new: "new",
    changed: "changed since you allowed it",
};

/**
 * The folder goes into `description` rather than `path`: every host shows a
 * `path` in place of the description, which would hide whether a plugin changed.
 */
export function pluginApprovalPrompt(
    pending: readonly PendingApproval[],
    workspaceFolders: readonly string[],
): ChoicePrompt<string> {
    return {
        id: PLUGIN_APPROVAL_PROMPT_ID,
        title: "Allow BPMN plugins from this workspace?",
        placeholder:
            "Plugins run their own code in the BPMN editor. Check only the ones you trust; open editors reload with them.",
        items: pending.map(({ artifact, state }) => ({
            label: artifact.name,
            description: `${STATE_DESCRIPTION[state]} · ${relativeToWorkspace(artifact.id, workspaceFolders)}`,
            value: artifact.id,
        })),
    };
}

export const PLUGIN_APPROVAL_NOTICE_ID = "bpmnPluginApprovalNotice";

export type PluginApprovalNoticeAction = ApprovalNoticeAction;

/** Opens nothing by itself: only "Review…" shows the list. */
export function pluginApprovalNotice(
    pending: readonly PendingApproval[],
): ActionNotice<PluginApprovalNoticeAction> {
    const message =
        pending.length === 1
            ? "1 BPMN plugin in this workspace is not allowed yet."
            : `${pending.length} BPMN plugins in this workspace are not allowed yet.`;
    return {
        id: PLUGIN_APPROVAL_NOTICE_ID,
        tone: "info",
        message,
        actions: [{ label: "Review…", value: "review" }],
    };
}

export interface CachedPluginFiles {
    readonly script: string;
    readonly style?: string;
}

/**
 * Where the approved bytes are copied for the webview to load. The webview
 * never reads the workspace folder, so neither a file changed after the
 * approval nor an unapproved file beside the script can reach it.
 */
export function cachedPluginFiles(cacheRoot: string, plugin: WorkspacePlugin): CachedPluginFiles {
    const directory = joinWorkspacePath(cacheRoot, plugin.contentHash);
    return {
        script: joinWorkspacePath(directory, "plugin.js"),
        ...(plugin.stylePath === undefined
            ? {}
            : { style: joinWorkspacePath(directory, "plugin.css") }),
    };
}

export interface CachedPluginFile {
    readonly path: string;
    readonly content: string;
}

export function cachedPluginCopy(
    files: CachedPluginFiles,
    script: string,
    style?: string,
): CachedPluginFile[] {
    return [
        { path: files.script, content: script },
        ...(files.style === undefined || style === undefined
            ? []
            : [{ path: files.style, content: style }]),
    ];
}
