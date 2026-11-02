import { join } from "node:path";

import { listDirectories, pathExists, readTextFile } from "./sourceTree";

export interface Workspace {
    readonly name: string;
    /** POSIX path relative to the repo root. */
    readonly dir: string;
}

interface Manifest {
    readonly name?: string;
    readonly workspaces?: readonly string[];
}

const DIRECT_CHILDREN = /^([^*?[\]{}!]+)\/\*$/;
const PLAIN_DIR = /^[^*?[\]{}!]+$/;

/** The root `workspaces` entries: `dir/*` and plain dirs; any other glob throws rather than silently matching less. */
export function readWorkspaces(repoRoot: string): Workspace[] {
    const patterns = readManifest(repoRoot, "package.json")?.workspaces ?? [];
    return patterns
        .flatMap((pattern) => workspaceDirsOf(repoRoot, pattern))
        .flatMap((dir) => {
            const name = readManifest(repoRoot, join(dir, "package.json"))?.name;
            return name === undefined ? [] : [{ name, dir }];
        });
}

/** A specifier names a workspace by its exact package name or a subpath of it. */
export function workspaceOfSpecifier(
    specifier: string,
    workspaces: readonly Workspace[],
): Workspace | undefined {
    return workspaces.find(({ name }) => specifier === name || specifier.startsWith(`${name}/`));
}

function workspaceDirsOf(repoRoot: string, pattern: string): string[] {
    const children = DIRECT_CHILDREN.exec(pattern);
    if (children !== null) {
        return listDirectories(join(repoRoot, children[1])).map((name) => `${children[1]}/${name}`);
    }
    if (PLAIN_DIR.test(pattern)) {
        return [pattern];
    }
    throw new Error(`workspace pattern "${pattern}" is neither "dir/*" nor a plain dir`);
}

function readManifest(repoRoot: string, path: string): Manifest | undefined {
    const absolute = join(repoRoot, path);
    return pathExists(absolute) ? (JSON.parse(readTextFile(absolute)) as Manifest) : undefined;
}
