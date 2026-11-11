import { ActionNotice } from "../../kernel/domain/actionNotice";
import {
    ApprovableArtifact,
    ApprovableCodeTexts,
    ApprovalNoticeAction,
    ApprovalState,
    approvalStateOf,
    approvedArtifacts,
    CodeApproval,
    CodeApprovalOutcome,
    isApprovedState,
    PendingCodeApproval,
    pendingApprovalDescription,
} from "../../kernel/domain/codeApproval";
import { DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import { escapeRegExpLiteral } from "../../kernel/domain/escapeRegExpLiteral";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";

export {
    approvalOutcome,
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

/** The prompt below says the same of several plugins. */
export const PLUGIN_CODE_TEXTS: ApprovableCodeTexts = {
    risk: "A plugin runs its own code in the BPMN editor.",
    allowedFollowUp: "Open editors reload with it.",
    revokedFollowUp: () => "Open editors reload without it.",
    carriedOver: ({ artifact, allowedAt }) =>
        `Allowed BPMN plugin ${artifact.name} in ${artifact.id}: you allowed the same content in ${allowedAt}.`,
};

export function pluginApprovalPrompt(
    pending: readonly PendingApproval[],
    workspaceFolders: readonly string[],
): ChoicePrompt<string> {
    return {
        id: PLUGIN_APPROVAL_PROMPT_ID,
        title: "Allow BPMN plugins from this workspace?",
        placeholder:
            "Plugins run their own code in the BPMN editor. Check only the ones you trust; open editors reload with them.",
        items: pending.map((each) => ({
            label: each.artifact.name,
            description: pendingApprovalDescription(each, workspaceFolders),
            value: each.artifact.id,
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

/** What an editor's last plugin answer held, each plugin at the content it was read with. */
export interface OfferedPlugins {
    readonly served: readonly ApprovableArtifact[];
    /** Every plugin found but not allowed, whether a notice still asks about it or not. */
    readonly withheld: readonly ApprovableArtifact[];
}

/**
 * The editors whose modules no longer match the approvals, each once in the
 * map's order: one serves a plugin not allowed at that content any more, or
 * was withheld one now allowed at the content it was offered.
 */
export function editorsToReload(
    offeredByEditor: ReadonlyMap<string, OfferedPlugins>,
    approvals: readonly CodeApproval[],
): string[] {
    const isApproved = (plugin: ApprovableArtifact) =>
        isApprovedState(approvalStateOf(plugin, approvals));
    return [...offeredByEditor]
        .filter(
            ([, { served, withheld }]) =>
                served.some((plugin) => !isApproved(plugin)) || withheld.some(isApproved),
        )
        .map(([editorId]) => editorId);
}

const CACHED_SCRIPT = "plugin.js";
const CACHED_STYLE = "plugin.css";

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
    const directory = cachedPluginDirectory(cacheRoot, plugin);
    return {
        script: joinWorkspacePath(directory, CACHED_SCRIPT),
        ...(plugin.stylePath === undefined
            ? {}
            : { style: joinWorkspacePath(directory, CACHED_STYLE) }),
    };
}

export function cachedPluginDirectory(cacheRoot: string, plugin: WorkspacePlugin): string {
    return joinWorkspacePath(cacheRoot, plugin.contentHash);
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

/** The name of a copy's folder in the plugin cache: the content hash, SHA-256 in lower-case hex. */
export const PLUGIN_CONTENT_HASH_PATTERN = "[0-9a-f]{64}";

const CACHED_FILE_NAMES = [CACHED_SCRIPT, CACHED_STYLE].map(escapeRegExpLiteral).join("|");

/** A copy's file relative to the cache root, the only cache paths a page may load. */
export const CACHED_PLUGIN_FILE_PATTERN = `${PLUGIN_CONTENT_HASH_PATTERN}/(?:${CACHED_FILE_NAMES})`;

const PLUGIN_CACHE_ENTRY = new RegExp(`^${PLUGIN_CONTENT_HASH_PATTERN}$`);

/**
 * The copies no stored approval names, of any workspace or project. Only a
 * folder named like a content hash is a candidate, so whatever else shares
 * the folder stays; a rule package row's prefixed hash names no copy.
 */
export function cacheEntriesToPrune(
    entries: readonly (readonly [string, DirectoryEntryKind])[],
    stored: readonly CodeApproval[],
): string[] {
    const named = new Set(stored.map(({ contentHash }) => contentHash));
    return entries
        .filter(
            ([name, kind]) =>
                kind === "directory" && PLUGIN_CACHE_ENTRY.test(name) && !named.has(name),
        )
        .map(([name]) => name);
}

/** Another process's prune can remove a copy this one already wrote. */
export function isWholeCachedCopy(
    plugin: WorkspacePlugin,
    entries: readonly (readonly [string, DirectoryEntryKind])[],
): boolean {
    const files = new Set(entries.filter(([, kind]) => kind === "file").map(([name]) => name));
    return files.has(CACHED_SCRIPT) && (plugin.stylePath === undefined || files.has(CACHED_STYLE));
}
