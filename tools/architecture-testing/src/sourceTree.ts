import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SourceFile {
    /** POSIX path relative to the tree root. */
    readonly path: string;
    readonly text: string;
}

export interface SourceTreeOptions {
    readonly extensions?: readonly string[];
    readonly includeSpecs?: boolean;
    /** Directory names skipped on top of the defaults. */
    readonly skipDirs?: readonly string[];
}

const DEFAULT_EXTENSIONS: readonly string[] = [".ts", ".tsx"];
const DEFAULT_SKIP_DIRS: readonly string[] = ["node_modules", "dist", "coverage", "__fixtures__"];
const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

export function readSourceTree(root: string, options: SourceTreeOptions = {}): SourceFile[] {
    const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
    const skipDirs = new Set([...DEFAULT_SKIP_DIRS, ...(options.skipDirs ?? [])]);
    const isIncluded = (name: string): boolean =>
        extensions.some((extension) => name.endsWith(extension)) &&
        !name.endsWith(".d.ts") &&
        (options.includeSpecs === true || !SPEC_FILE.test(name));
    return listFiles(root, "", skipDirs, isIncluded)
        .sort()
        .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
}

function listFiles(
    root: string,
    relativeDir: string,
    skipDirs: ReadonlySet<string>,
    isIncluded: (name: string) => boolean,
): string[] {
    return readdirSync(join(root, relativeDir), { withFileTypes: true }).flatMap((entry) => {
        const path = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) {
            return skipDirs.has(entry.name) ? [] : listFiles(root, path, skipDirs, isIncluded);
        }
        return isIncluded(entry.name) ? [path] : [];
    });
}
