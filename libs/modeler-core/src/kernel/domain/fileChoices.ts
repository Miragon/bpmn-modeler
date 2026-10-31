import { posix } from "path";

import { ChoiceItem } from "./prompts";
import { relativeToWorkspace } from "./rootContainment";

/** A file offered by its name; its path tells files of the same name apart. */
export function fileChoice(path: string): ChoiceItem<string> {
    return { label: posix.basename(path), path, value: path };
}

/** Ordered as VS Code shows the paths, so both hosts list the files alike. */
export function fileChoicesInWorkspaceOrder(
    paths: readonly string[],
    workspaceFolders: readonly string[],
): ChoiceItem<string>[] {
    return paths
        .map((path) => ({ path, workspacePath: relativeToWorkspace(path, workspaceFolders) }))
        .sort((a, b) => a.workspacePath.localeCompare(b.workspacePath))
        .map(({ path }) => fileChoice(path));
}
