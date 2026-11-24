import { extensions } from "vscode";

import type { API, GitExtension } from "./vscodeGitApi";

const GIT_EXTENSION_ID = "vscode.git";

/** The built-in Git extension as VS Code holds it, running or not; none where it is missing. */
export function gitExtensionHandle() {
    return extensions.getExtension<GitExtension>(GIT_EXTENSION_ID);
}

/** The Git API, or none while Git is disabled: `getAPI` throws then, also between a check and the call. */
export function gitApiOf(git: GitExtension): API | undefined {
    try {
        return git.getAPI(1);
    } catch {
        return undefined;
    }
}
