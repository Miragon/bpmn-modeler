import {
    DECLARATION_FILE,
    isBuildConfig,
    isTestOrDeclarationFile,
    SCRIPT_FILE,
    SPEC_FILE,
    TYPESCRIPT_FILE,
} from "@miragon/architecture-testing";

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
    /** Tracked files the repository declares generated: `linguist-generated` in `.gitattributes`. */
    readonly generatedFiles: readonly string[];
    readonly links: readonly ImportLink[];
    readonly workspaces: readonly WorkspaceLayout[];
}

/** A declaration file of any module kind runs no code, and a caller's import resolves to the module it types. */
export function isParsedIntoDeclarationGraph(path: string): boolean {
    return SCRIPT_FILE.test(path) && !SPEC_FILE.test(path) && !DECLARATION_FILE.test(path);
}

export function isDataFile(path: string): boolean {
    return !SCRIPT_FILE.test(path);
}

export function measuredFiles({
    files,
    barrels,
    generatedFiles,
    workspaces,
}: SourceLayout): Set<string> {
    const unread = new Set([...barrels, ...generatedFiles]);
    return new Set(files.filter((path) => !unread.has(path) && isMeasured(path, workspaces)));
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
    if (isTestOrDeclarationFile(inWorkspace)) {
        return false;
    }
    const name = inWorkspace.split("/").pop() as string;
    if (name.endsWith(".json")) {
        return inWorkspace.startsWith("src/");
    }
    // Build configs are read only for the entries they name, see `namedPaths`.
    if (name.endsWith(".mjs")) {
        return !isBuildConfig(name);
    }
    if (name.endsWith(".kt")) {
        return inWorkspace.startsWith("src/main/");
    }
    return TYPESCRIPT_FILE.test(name) && inWorkspace.startsWith("src/");
}
