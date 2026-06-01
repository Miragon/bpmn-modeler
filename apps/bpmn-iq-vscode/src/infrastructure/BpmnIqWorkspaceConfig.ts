import { basename, resolve } from "path";
import { randomUUID } from "crypto";

import { FileSystemError, Uri, workspace } from "vscode";

import {
    type WorkspaceConfig,
    WORKSPACE_CONFIG_DIR,
    WORKSPACE_CONFIG_FILE,
    parseWorkspaceConfig,
    serializeWorkspaceConfig,
} from "@miragon/bpmn-iq-daemon-client";

import { type GitInfo, deriveWorkspaceId } from "@miragon/bpmn-iq-daemon-client/identity";

export type { WorkspaceConfig };

/**
 * Reader/writer for `<root>/.bpmn-iq/workspace.json`.
 *
 * The on-disk shape (`WorkspaceConfig`), its location constants
 * (`WORKSPACE_CONFIG_DIR`, `WORKSPACE_CONFIG_FILE`), and the
 * parser/serializer all live in `@miragon/bpmn-iq-daemon-client` so
 * the CLI agent and this extension are byte-identical.  This class
 * is a thin VS-Code-`fs` shell around them.
 */
export class BpmnIqWorkspaceConfig {
    /** URI of the config file for the given workspace root. */
    static fileUri(root: string): Uri {
        return Uri.joinPath(Uri.file(root), WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE);
    }

    /** Load an existing config or return `null` if none exists yet. */
    async load(root: string): Promise<WorkspaceConfig | null> {
        try {
            const buf = await workspace.fs.readFile(BpmnIqWorkspaceConfig.fileUri(root));
            return parseWorkspaceConfig(buf.toString());
        } catch (err) {
            if (err instanceof FileSystemError && err.code === "FileNotFound") {
                return null;
            }
            throw err;
        }
    }

    /** Save (overwrite) the config file, creating parent directories as needed. */
    async save(root: string, meta: WorkspaceConfig): Promise<void> {
        const dirUri = Uri.joinPath(Uri.file(root), WORKSPACE_CONFIG_DIR);
        await workspace.fs.createDirectory(dirUri);
        const fileUri = BpmnIqWorkspaceConfig.fileUri(root);
        await workspace.fs.writeFile(fileUri, Buffer.from(serializeWorkspaceConfig(meta), "utf-8"));
    }

    /**
     * Create a fresh config with a random `workspaceId` (or a caller-supplied
     * one, used when joining an existing workspace).
     */
    buildNew(opts: { name: string; workspaceId?: string }): WorkspaceConfig {
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
    buildForGit(opts: { root: string; git: GitInfo; name?: string }): WorkspaceConfig {
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
