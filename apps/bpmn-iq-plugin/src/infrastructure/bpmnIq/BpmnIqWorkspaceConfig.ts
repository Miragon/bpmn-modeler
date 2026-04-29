import { basename, resolve } from "path";
import { randomUUID } from "crypto";

import { FileSystemError, Uri, workspace } from "vscode";

import { type BpmnIqWorkspaceMeta } from "../../domain/bpmnIq/BpmnIqWorkspaceMeta";
import { deriveWorkspaceId, type GitInfo } from "../../domain/bpmnIq/gitDetect";
import { parseStoredMeta } from "../../domain/bpmnIq/storedMeta";

export type { BpmnIqWorkspaceMeta };

export const BPMN_IQ_CONFIG_DIR = ".bpmn-iq";
export const BPMN_IQ_CONFIG_FILE = "workspace.json";

/**
 * Reader/writer for `<root>/.bpmn-iq/workspace.json`.
 *
 * The on-disk shape is **identical to what the upstream `bpmn-iq` CLI agent
 * produces**, so the same workspace can be used interchangeably by the
 * CLI and by this extension.
 *
 * Reads accept both the new `workspaceId` field (≥ daemon-client 0.4) and
 * the legacy `wsId` field (≤ 0.3), so existing on-disk configs migrate
 * transparently the next time `save()` runs. The actual parsing+migration
 * lives in {@link parseStoredMeta}; this class is a thin VS-Code-fs shell.
 */
export class BpmnIqWorkspaceConfig {
    /** URI of the config file for the given workspace root. */
    static fileUri(root: string): Uri {
        return Uri.joinPath(Uri.file(root), BPMN_IQ_CONFIG_DIR, BPMN_IQ_CONFIG_FILE);
    }

    /** Load an existing config or return `null` if none exists yet. */
    async load(root: string): Promise<BpmnIqWorkspaceMeta | null> {
        try {
            const buf = await workspace.fs.readFile(BpmnIqWorkspaceConfig.fileUri(root));
            return parseStoredMeta(buf.toString());
        } catch (err) {
            if (err instanceof FileSystemError && err.code === "FileNotFound") {
                return null;
            }
            throw err;
        }
    }

    /** Save (overwrite) the config file, creating parent directories as needed. */
    async save(root: string, meta: BpmnIqWorkspaceMeta): Promise<void> {
        const dirUri = Uri.joinPath(Uri.file(root), BPMN_IQ_CONFIG_DIR);
        await workspace.fs.createDirectory(dirUri);
        const fileUri = BpmnIqWorkspaceConfig.fileUri(root);
        const payload = JSON.stringify(meta, null, 2) + "\n";
        await workspace.fs.writeFile(fileUri, Buffer.from(payload, "utf-8"));
    }

    /**
     * Create a fresh config with a random `workspaceId` (or a caller-supplied
     * one, used when joining an existing workspace).
     */
    buildNew(opts: { name: string; workspaceId?: string }): BpmnIqWorkspaceMeta {
        return {
            workspaceId: opts.workspaceId ?? randomUUID(),
            name: opts.name,
            createdAt: new Date().toISOString(),
        };
    }

    /**
     * Build a config whose `workspaceId` is deterministically derived from the
     * git `(repoId, branch)` pair so peers on the same branch automatically
     * land in the same daemon-side workspace.
     */
    buildForGit(opts: {
        root: string;
        git: GitInfo;
        name?: string;
    }): BpmnIqWorkspaceMeta {
        const display = opts.git.repoSlug ?? basename(resolve(opts.root));
        return {
            workspaceId: deriveWorkspaceId(opts.git.repoId, opts.git.branch),
            name: opts.name ?? `${display} · ${opts.git.branch}`,
            repoId: opts.git.repoId,
            repoSlug: opts.git.repoSlug,
            branch: opts.git.branch,
            createdAt: new Date().toISOString(),
        };
    }
}
