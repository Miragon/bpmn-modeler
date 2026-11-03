import { join } from "node:path";

import { listDirectories, pathExists, readTextFile } from "./sourceTree";

export interface Workspace {
    readonly name: string;
    /** POSIX path relative to the repo root. */
    readonly dir: string;
    /** The manifest's `architecture` field, unchecked; see `isWorkspaceKind`. */
    readonly kind?: string;
}

interface Manifest {
    readonly name?: string;
    readonly architecture?: string;
    readonly workspaces?: readonly string[];
}

const DIRECT_CHILDREN = /^([^*?[\]{}!]+)\/\*$/;
const PLAIN_DIR = /^[^*?[\]{}!]+$/;

/** The root `workspaces` entries: `dir/*` and plain dirs; any other glob throws rather than silently matching less. */
export function readWorkspaces(repoRoot: string): Workspace[] {
    return readWorkspaceDirs(repoRoot).flatMap((dir) => {
        const manifest = readManifest(repoRoot, join(dir, "package.json"));
        if (manifest?.name === undefined) {
            return [];
        }
        return manifest.architecture === undefined
            ? [{ name: manifest.name, dir }]
            : [{ name: manifest.name, dir, kind: manifest.architecture }];
    });
}

/** The dirs the root `workspaces` entries match, with or without a manifest of their own. */
export function readWorkspaceDirs(repoRoot: string): string[] {
    const patterns = readManifest(repoRoot, "package.json")?.workspaces ?? [];
    return patterns.flatMap((pattern) => workspaceDirsOf(repoRoot, pattern));
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
