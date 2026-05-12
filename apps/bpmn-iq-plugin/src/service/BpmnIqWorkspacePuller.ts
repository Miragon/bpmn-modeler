import { Uri, WorkspaceFolder, workspace } from "vscode";

import { isSafeRelPath } from "../domain/bpmnIq/pathUtils";
import type { BpmnIqPort } from "../domain/bpmnIq/BpmnIqPort";
import type { BpmnIqWorkspaceConfig } from "../infrastructure/bpmnIq/BpmnIqWorkspaceConfig";

export interface PullResult {
    /** Number of models actually written to disk. */
    written: number;
    /** Number of models the daemon returned that were rejected by the
     *  `isSafeRelPath` guard (path traversal / absolute / Windows-style). */
    skippedUnsafe: number;
    /** Display name reported by the daemon. */
    workspaceName: string;
}

/**
 * "Pull" semantics: copy every model from a daemon-side workspace into a
 * local folder and persist the corresponding `.bpmn-iq/workspace.json`.
 *
 * Lives outside the controller so the security-relevant logic — refusing
 * untrusted relPaths from the daemon — sits in one place and is reused by
 * any future caller that wants the same behaviour.
 */
export class BpmnIqWorkspacePuller {
    constructor(
        private readonly portFactory: (baseUrl: string, workspaceId: string) => BpmnIqPort,
        private readonly workspaceConfig: BpmnIqWorkspaceConfig,
    ) {}

    async pull(
        folder: WorkspaceFolder,
        daemonUrl: string,
        workspaceId: string,
    ): Promise<PullResult> {
        const port = this.portFactory(daemonUrl, workspaceId);
        const { workspace: remote, models } = await port.listWorkspaceModels();

        let written = 0;
        let skippedUnsafe = 0;

        for (const m of models) {
            if (!isSafeRelPath(m.relPath)) {
                skippedUnsafe += 1;
                continue;
            }
            const fileUri = Uri.joinPath(folder.uri, ...m.relPath.split("/"));
            const dirUri = Uri.joinPath(fileUri, "..");
            await workspace.fs.createDirectory(dirUri);
            await workspace.fs.writeFile(fileUri, Buffer.from(m.xml, "utf-8"));
            written += 1;
        }

        await this.workspaceConfig.save(folder.uri.fsPath, {
            workspaceId: remote.workspaceId,
            name: remote.name,
            createdAt: remote.createdAt,
            repoId: remote.repoId,
            repoSlug: remote.repoSlug,
            branch: remote.branch,
        });

        return { written, skippedUnsafe, workspaceName: remote.name };
    }
}
