import { extensions, Uri } from "vscode";

import type { StagedChangesLookup } from "../../domain/documentRevision";
import type { GitExtension } from "./vscodeGitApi";

/**
 * Whether the built-in Git extension lists a file among its staged changes:
 * the test by which it reads a `~` document from the index and not from HEAD.
 * Reads Git's state as it stands, without waiting, since a `git:` document is
 * open only while the extension runs. Cannot tell while Git is missing, not
 * running or disabled, or holds no open repository of the file.
 */
export const gitStagedChanges: StagedChangesLookup = (filePath) => {
    try {
        const git = extensions.getExtension<GitExtension>("vscode.git");
        if (!git?.isActive) return undefined;
        const file = Uri.file(filePath);
        const fileUri = file.toString();
        // `getAPI` throws while Git is disabled.
        return git.exports
            .getAPI(1)
            .getRepository(file)
            ?.state.indexChanges.some((change) => change.uri.toString() === fileUri);
    } catch {
        return undefined;
    }
};
