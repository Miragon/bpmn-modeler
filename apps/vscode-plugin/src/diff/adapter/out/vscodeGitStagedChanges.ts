import { Uri } from "vscode";

import type { StagedChangesLookup } from "../../domain/documentRevision";
import { gitApiOf, gitExtensionHandle } from "./vscodeGitExtension";

/**
 * Whether the built-in Git extension lists a file among its staged changes:
 * the test by which it reads a `~` document from the index and not from HEAD.
 * Reads Git's state as it stands, without starting the extension or waiting,
 * since a `git:` document is open only while it runs. Cannot tell while Git
 * is missing, not running or disabled, or holds no open repository of the file.
 */
export const gitStagedChanges: StagedChangesLookup = (filePath) => {
    const git = gitExtensionHandle();
    if (!git?.isActive) return undefined;
    const file = Uri.file(filePath);
    const fileUri = file.toString();
    return gitApiOf(git.exports)
        ?.getRepository(file)
        ?.state.indexChanges.some((change) => change.uri.toString() === fileUri);
};
