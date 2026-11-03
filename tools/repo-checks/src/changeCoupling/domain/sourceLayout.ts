export interface ImportLink {
    readonly from: string;
    readonly to: string;
}

export interface WorkspaceLayout {
    /** POSIX path relative to the repo root, as every path here. */
    readonly dir: string;
    readonly compositionFiles: readonly string[];
    /** Files of the workspace a string in its manifest or a build config at its root names. */
    readonly namedPaths: readonly string[];
    /** Its manifest declares what the host shows, such as a VS Code extension's `contributes`. */
    readonly contributesToHost: boolean;
}

export interface SourceLayout {
    /** Today's tracked files. */
    readonly files: readonly string[];
    readonly barrels: readonly string[];
    readonly links: readonly ImportLink[];
    readonly workspaces: readonly WorkspaceLayout[];
}

const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set([
    "__fixtures__",
    "__tests__",
    "languages",
    "test",
    "tests",
]);
const DATA_FILE = /\.(schema|cases)\.json$/;
const TYPESCRIPT_FILE = /\.tsx?$/;

export function measuredFiles({ files, barrels, workspaces }: SourceLayout): Set<string> {
    const barrelFiles = new Set(barrels);
    return new Set(files.filter((path) => !barrelFiles.has(path) && isMeasured(path, workspaces)));
}

export function compositionRoots({ workspaces }: SourceLayout): Set<string> {
    return new Set(
        workspaces.flatMap(({ dir, compositionFiles, namedPaths, contributesToHost }) => [
            ...compositionFiles,
            ...namedPaths,
            ...(contributesToHost ? [`${dir}/package.json`] : []),
        ]),
    );
}

export function workspaceDirOf(path: string, workspaceDirs: readonly string[]): string | undefined {
    return workspaceDirs.find((dir) => path.startsWith(`${dir}/`));
}

function isMeasured(path: string, workspaces: readonly WorkspaceLayout[]): boolean {
    const workspace = workspaces.find(({ dir }) => path.startsWith(`${dir}/`));
    if (workspace === undefined) {
        return false;
    }
    const inWorkspace = path.slice(workspace.dir.length + 1);
    if (inWorkspace === "package.json") {
        return workspace.contributesToHost;
    }
    const segments = inWorkspace.split("/");
    const name = segments.pop() as string;
    if (segments.some((folder) => SKIPPED_FOLDERS.has(folder)) || SPEC_FILE.test(name)) {
        return false;
    }
    if (DATA_FILE.test(name)) {
        return true;
    }
    // Build configs are read only for the entries they name, see `namedPaths`.
    if (name.endsWith(".mjs")) {
        return !name.includes(".config.");
    }
    if (name.endsWith(".kt")) {
        return inWorkspace.startsWith("src/main/");
    }
    return TYPESCRIPT_FILE.test(name) && !name.endsWith(".d.ts") && inWorkspace.startsWith("src/");
}
