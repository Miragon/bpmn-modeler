import {
    findImplementations,
    readKotlinImports,
    readKotlinInitializedValues,
    readKotlinTextLiterals,
    readModuleImports,
    readPathAliases,
    readTextLiterals,
    type SourceFile,
} from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import {
    type HostFileSource,
    isKotlinSource,
    isScannedSource,
    type SourceDependencies,
} from "../../domain/hostText";
import type { HostTextSources } from "../../port/HostTextSources";

function readSource(repoRoot: string, path: string): string {
    return readFileSync(join(repoRoot, path), "utf8");
}

function importedSpecifiers({ path, text }: SourceFile): string[] {
    const specifiers = isKotlinSource(path)
        ? readKotlinImports(text)
        : readModuleImports(path, text).map(({ specifier }) => specifier);
    return [...new Set(specifiers)];
}

function interfaceFilesByPath(
    repoRoot: string,
    typeScriptTree: readonly SourceFile[],
): Map<string, Set<string>> {
    const tsconfig = join(repoRoot, "tsconfig.base.json");
    const aliases = existsSync(tsconfig) ? readPathAliases(readFileSync(tsconfig, "utf8")) : [];
    const filesByPath = new Map<string, Set<string>>();
    for (const { path, interfaceFiles } of findImplementations(typeScriptTree, { aliases })) {
        const files = filesByPath.get(path) ?? new Set<string>();
        interfaceFiles.forEach((file) => files.add(file));
        filesByPath.set(path, files);
    }
    return filesByPath;
}

export class EngineHostTextSources implements HostTextSources {
    readDependencies(repoRoot: string): readonly SourceDependencies[] {
        const tree = trackedFiles(repoRoot)
            .filter(isScannedSource)
            .map((path): SourceFile => ({ path, text: readSource(repoRoot, path) }));
        const implemented = interfaceFilesByPath(
            repoRoot,
            tree.filter(({ path }) => !isKotlinSource(path)),
        );
        return tree.map((file) => ({
            path: file.path,
            importedSpecifiers: importedSpecifiers(file),
            implementedInterfaceFiles: [...(implemented.get(file.path) ?? [])],
        }));
    }

    readSource(repoRoot: string, path: string): HostFileSource {
        const text = readSource(repoRoot, path);
        return isKotlinSource(path)
            ? { texts: readKotlinTextLiterals(text), initializedValues: readKotlinInitializedValues(text) }
            : { texts: readTextLiterals(path, text), initializedValues: [] };
    }
}
