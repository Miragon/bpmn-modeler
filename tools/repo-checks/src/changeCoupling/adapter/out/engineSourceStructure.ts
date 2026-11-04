import {
    buildDeclarationGraph,
    readModuleSymbols,
    readPathAliases,
    readStringLiterals,
    readWorkspaceDirs,
    resolveWithSuffixes,
    roleOf,
} from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import type { SourceLayout, WorkspaceLayout } from "../../domain/sourceLayout";
import type { SourceStructure } from "../../port/SourceStructure";

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const UNPARSED_SCRIPT = /\.(spec|test)\.[cm]?[jt]sx?$|\.d\.ts$/;
const BUILD_CONFIG = /^[^/]+\.config\.[cm]?[jt]s$/;

export class EngineSourceStructure implements SourceStructure {
    read(repoRoot: string): SourceLayout {
        const files = trackedFiles(repoRoot);
        const readText = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
        const tree = files
            .filter((path) => SCRIPT_FILE.test(path) && !UNPARSED_SCRIPT.test(path))
            .map((path) => ({ path, text: readText(path) }));
        const tsconfig = join(repoRoot, "tsconfig.base.json");
        const aliases = existsSync(tsconfig) ? readPathAliases(readFileSync(tsconfig, "utf8")) : [];
        const known = new Set(files);
        return {
            files,
            barrels: tree
                .filter(({ path, text }) => readModuleSymbols(path, text).declaresNothing)
                .map(({ path }) => path),
            links: buildDeclarationGraph(tree, {
                aliases,
                dataFiles: files.filter((path) => !SCRIPT_FILE.test(path)),
            }),
            workspaces: readWorkspaceDirs(repoRoot).map((dir) =>
                workspaceLayout(dir, files, known, readText),
            ),
        };
    }
}

function workspaceLayout(
    dir: string,
    files: readonly string[],
    known: ReadonlySet<string>,
    readText: (path: string) => string,
): WorkspaceLayout {
    const sourceRoot = `${dir}/src/`;
    const manifestPath = `${dir}/package.json`;
    // A Gradle project such as the IntelliJ plugin has no manifest of its own.
    const manifest = known.has(manifestPath)
        ? (JSON.parse(readText(manifestPath)) as Record<string, unknown>)
        : {};
    const buildConfigs = files.filter(
        (path) => path.startsWith(`${dir}/`) && BUILD_CONFIG.test(path.slice(dir.length + 1)),
    );
    const literals = [
        ...jsonStrings(manifest),
        ...buildConfigs.flatMap((path) => readStringLiterals(path, readText(path))),
    ];
    const namedPaths = literals.flatMap((literal) => {
        const candidate = posix.normalize(posix.join(dir, literal));
        const resolved = candidate.startsWith(`${dir}/`)
            ? resolveWithSuffixes(candidate, known)
            : undefined;
        return resolved === undefined ? [] : [resolved];
    });
    return {
        dir,
        compositionFiles: files.filter(
            (path) =>
                path.startsWith(sourceRoot) &&
                roleOf(path.slice(sourceRoot.length))?.role === "composition",
        ),
        namedPaths: [...new Set(namedPaths)].sort(),
        contributesToHost: manifest.contributes !== undefined,
    };
}

function jsonStrings(value: unknown): string[] {
    if (typeof value === "string") {
        return [value];
    }
    return typeof value === "object" && value !== null ? Object.values(value).flatMap(jsonStrings) : [];
}
