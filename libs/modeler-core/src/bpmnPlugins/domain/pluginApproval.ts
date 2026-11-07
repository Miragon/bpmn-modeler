import { ActionNotice } from "../../kernel/domain/actionNotice";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { relativeToWorkspace } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";

/** A plugin found in a workspace's `<configFolder>/plugins/<folder>`. */
export interface WorkspacePlugin {
    /** The plugin folder: an approval is for this folder, never for a name a repo can copy. */
    readonly id: string;
    readonly name: string;
    readonly scriptPath: string;
    readonly stylePath?: string;
    /** Covers the script and the style, so any change to either asks again. */
    readonly contentHash: string;
}

/**
 * The user allowed this content in this folder. Kept by the host for the
 * user, outside the workspace, so a repository cannot approve itself.
 */
export interface PluginApproval {
    readonly pluginId: string;
    readonly contentHash: string;
}

export type PluginApprovalState = "approved" | "new" | "changed";

export interface PendingApproval {
    readonly plugin: WorkspacePlugin;
    readonly state: Exclude<PluginApprovalState, "approved">;
}

export const PLUGIN_APPROVAL_PROMPT_ID = "bpmnPluginApproval";

/** What the content hash covers; a NUL cannot occur in either text file. */
export function approvedContent(script: string, style: string | undefined): string {
    return `${script}\u0000${style ?? ""}`;
}

export function approvalStateOf(
    plugin: WorkspacePlugin,
    approvals: readonly PluginApproval[],
): PluginApprovalState {
    const approval = approvals.find((each) => each.pluginId === plugin.id);
    if (approval === undefined) {
        return "new";
    }
    return approval.contentHash === plugin.contentHash ? "approved" : "changed";
}

export function approvedPlugins<P extends WorkspacePlugin>(
    plugins: readonly P[],
    approvals: readonly PluginApproval[],
): P[] {
    return plugins.filter((plugin) => approvalStateOf(plugin, approvals) === "approved");
}

export function approvalsAllowing(
    approvals: readonly PluginApproval[],
    allowed: readonly WorkspacePlugin[],
): PluginApproval[] {
    const allowedIds = new Set(allowed.map((plugin) => plugin.id));
    return [
        ...approvals.filter((approval) => !allowedIds.has(approval.pluginId)),
        ...allowed.map((plugin) => ({ pluginId: plugin.id, contentHash: plugin.contentHash })),
    ];
}

/** Names one plugin version, so a decline lasts only until its content changes. */
export function declineKeyOf(plugin: WorkspacePlugin): string {
    return `${plugin.id}#${plugin.contentHash}`;
}

export function pendingApprovals(
    plugins: readonly WorkspacePlugin[],
    approvals: readonly PluginApproval[],
    declinedThisSession: ReadonlySet<string>,
): PendingApproval[] {
    return plugins.flatMap((plugin) => {
        const state = approvalStateOf(plugin, approvals);
        return state === "approved" || declinedThisSession.has(declineKeyOf(plugin))
            ? []
            : [{ plugin, state }];
    });
}

export interface ApprovalOutcome {
    readonly allowed: readonly WorkspacePlugin[];
    /** {@link declineKeyOf} of each plugin left unchecked; a dismissal leaves all of them. */
    readonly declineKeys: readonly string[];
}

export function approvalOutcome(
    pending: readonly PendingApproval[],
    checkedIds: readonly string[],
): ApprovalOutcome {
    const checked = new Set(checkedIds);
    return {
        allowed: pending.filter(({ plugin }) => checked.has(plugin.id)).map(({ plugin }) => plugin),
        declineKeys: pending
            .filter(({ plugin }) => !checked.has(plugin.id))
            .map(({ plugin }) => declineKeyOf(plugin)),
    };
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
        items: pending.map(({ plugin, state }) => ({
            label: plugin.name,
            description: `${STATE_DESCRIPTION[state]} · ${relativeToWorkspace(plugin.id, workspaceFolders)}`,
            value: plugin.id,
        })),
    };
}

export const PLUGIN_APPROVAL_NOTICE_ID = "bpmnPluginApprovalNotice";

export type PluginApprovalNoticeAction = "review";

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
    readonly directory: string;
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
        directory,
        script: joinWorkspacePath(directory, "plugin.js"),
        ...(plugin.stylePath === undefined
            ? {}
            : { style: joinWorkspacePath(directory, "plugin.css") }),
    };
}

/**
 * Whether a listing of the copy's directory holds every file of the copy.
 * Typed loosely so the entry kinds keep their one home, `WorkspacePort.readDirectory`.
 */
export function holdsCachedPluginFiles(
    entries: readonly (readonly [name: string, type: string])[],
    files: CachedPluginFiles,
): boolean {
    const names = new Set(entries.filter(([, type]) => type === "file").map(([name]) => name));
    return [files.script, files.style]
        .filter((path) => path !== undefined)
        .every((path) => names.has(path.slice(path.lastIndexOf("/") + 1)));
}
