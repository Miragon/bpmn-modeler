import {
    findImplementations,
    readModuleImports,
    readPathAliases,
    readTextLiterals,
    type SourceFile,
} from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import { isScannedSource, type SourceDependencies, type WrittenText } from "../../domain/hostText";
import type { HostTextSources } from "../../port/HostTextSources";

function readSource(repoRoot: string, path: string): string {
    return readFileSync(join(repoRoot, path), "utf8");
}

export class EngineHostTextSources implements HostTextSources {
    readDependencies(repoRoot: string): readonly SourceDependencies[] {
        const tree = trackedFiles(repoRoot)
            .filter(isScannedSource)
            .map((path): SourceFile => ({ path, text: readSource(repoRoot, path) }));
        const tsconfig = join(repoRoot, "tsconfig.base.json");
        const aliases = existsSync(tsconfig) ? readPathAliases(readFileSync(tsconfig, "utf8")) : [];
        const interfaceFilesByPath = new Map<string, Set<string>>();
        for (const { path, interfaceFiles } of findImplementations(tree, { aliases })) {
            const files = interfaceFilesByPath.get(path) ?? new Set<string>();
            interfaceFiles.forEach((file) => files.add(file));
            interfaceFilesByPath.set(path, files);
        }
        return tree.map(({ path, text }) => ({
            path,
            importedSpecifiers: [
                ...new Set(readModuleImports(path, text).map(({ specifier }) => specifier)),
            ],
            implementedInterfaceFiles: [...(interfaceFilesByPath.get(path) ?? [])],
        }));
    }

    readTexts(repoRoot: string, path: string): readonly WrittenText[] {
        return readTextLiterals(path, readSource(repoRoot, path));
    }
}
