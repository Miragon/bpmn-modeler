import { ActionNotice } from "../../kernel/domain/actionNotice";
import { ALLOWANCE_COVERS_TEXT, ApprovableArtifact } from "../../kernel/domain/allowance";
import {
    ApprovableCodeTexts,
    ApprovalNoticeAction,
    CodeApproval,
} from "../../kernel/domain/codeApproval";
import { DirectoryEntryKind } from "../../kernel/domain/directoryEntry";
import { escapeRegExpLiteral } from "../../kernel/domain/escapeRegExpLiteral";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { relativeToWorkspace } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { runsInWorkspace } from "../../kernel/domain/workspaceTrust";
import { LAST_USE_MARKER_FILE, lastUseMarkerText } from "./pluginCacheLastUse";

/** A plugin found in a workspace's `<configFolder>/plugins/<folder>`; its id is that folder. */
export interface WorkspacePlugin extends ApprovableArtifact {
    readonly scriptPath: string;
    readonly stylePath?: string;
    /** Names the content-addressed cache copy; no allowance reads it. */
    readonly contentHash: string;
}

export type PluginApproval = CodeApproval;

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
};

/**
 * The folder goes into a list item's `description` rather than its `path`:
 * every host shows a `path` in place of the description.
 */
export function pluginApprovalPrompt(
    pending: readonly WorkspacePlugin[],
    workspaceFolders: readonly string[],
): ChoicePrompt<string> {
    return {
        id: PLUGIN_APPROVAL_PROMPT_ID,
        title: "Allow BPMN plugins from this workspace?",
        placeholder: `Plugins run their own code in the BPMN editor. Allowing one ${ALLOWANCE_COVERS_TEXT}. Check only the ones you trust; open editors reload with them.`,
        items: pending.map((plugin) => ({
            label: plugin.name,
            description: relativeToWorkspace(plugin.id, workspaceFolders),
            value: plugin.id,
        })),
    };
}

export const PLUGIN_APPROVAL_NOTICE_ID = "bpmnPluginApprovalNotice";

export type PluginApprovalNoticeAction = ApprovalNoticeAction;

/** Opens nothing by itself: only "Review…" shows the list. */
export function pluginApprovalNotice(
    pending: readonly WorkspacePlugin[],
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

/** What an editor's last plugin answer held, each plugin as it was read then. */
export interface OfferedPlugins {
    readonly served: readonly WorkspacePlugin[];
    /** Every plugin found but not allowed, whether a notice still asks about it or not. */
    readonly withheld: readonly WorkspacePlugin[];
}

/**
 * The editors whose modules no longer match the approvals and the workspace's
 * trust, each once in the map's order: one serves a plugin that may no longer
 * run, or was withheld one that may now. A content edit reloads none: the
 * next request serves its new copy.
 */
export function editorsToReload(
    offeredByEditor: ReadonlyMap<string, OfferedPlugins>,
    approvals: readonly CodeApproval[],
    trusted: boolean,
): string[] {
    const runs = (plugin: WorkspacePlugin) => runsInWorkspace(plugin, approvals, trusted);
    return [...offeredByEditor]
        .filter(
            ([, { served, withheld }]) =>
                served.some((plugin) => !runs(plugin)) || withheld.some(runs),
        )
        .map(([editorId]) => editorId);
}

const CACHED_SCRIPT = "plugin.js";
const CACHED_STYLE = "plugin.css";

export interface CachedPluginFiles {
    readonly script: string;
    readonly style?: string;
    readonly lastUse: string;
}

/**
 * Where the allowed bytes read for a request are copied for the webview to
 * load. The webview never reads the workspace folder, so neither a file
 * swapped after the copy nor a file beside the script that no manifest names
 * can reach it.
 */
export function cachedPluginFiles(cacheRoot: string, plugin: WorkspacePlugin): CachedPluginFiles {
    const directory = cachedPluginDirectory(cacheRoot, plugin);
    return {
        script: joinWorkspacePath(directory, CACHED_SCRIPT),
        ...(plugin.stylePath === undefined
            ? {}
            : { style: joinWorkspacePath(directory, CACHED_STYLE) }),
        lastUse: joinWorkspacePath(directory, LAST_USE_MARKER_FILE),
    };
}

export function cachedPluginDirectory(cacheRoot: string, plugin: WorkspacePlugin): string {
    return joinWorkspacePath(cacheRoot, plugin.contentHash);
}

export function lastUseMarkerOf(cacheRoot: string, copyName: string): string {
    return joinWorkspacePath(cacheRoot, copyName, LAST_USE_MARKER_FILE);
}

export interface CachedPluginFile {
    readonly path: string;
    readonly content: string;
}

export function cachedPluginCopy(
    files: CachedPluginFiles,
    script: string,
    style: string | undefined,
    nowMs: number,
): CachedPluginFile[] {
    return [
        { path: files.lastUse, content: lastUseMarkerText(nowMs) },
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

/** Only a folder named like a content hash is a copy, so whatever else shares the folder stays. */
export function cachedCopyNames(
    entries: readonly (readonly [string, DirectoryEntryKind])[],
): string[] {
    return entries
        .filter(([name, kind]) => kind === "directory" && PLUGIN_CACHE_ENTRY.test(name))
        .map(([name]) => name);
}

export function contentServedByEditors(
    offeredByEditor: ReadonlyMap<string, OfferedPlugins>,
): ReadonlySet<string> {
    return new Set(
        [...offeredByEditor.values()].flatMap(({ served }) =>
            served.map(({ contentHash }) => contentHash),
        ),
    );
}

/** Another process's prune can remove a copy this one already wrote. */
export function isWholeCachedCopy(
    plugin: WorkspacePlugin,
    entries: readonly (readonly [string, DirectoryEntryKind])[],
): boolean {
    const files = new Set(entries.filter(([, kind]) => kind === "file").map(([name]) => name));
    return files.has(CACHED_SCRIPT) && (plugin.stylePath === undefined || files.has(CACHED_STYLE));
}
