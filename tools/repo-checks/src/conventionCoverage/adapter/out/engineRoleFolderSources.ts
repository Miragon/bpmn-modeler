import {
    buildImportGraph,
    findImplementations,
    isTypeScriptSource,
    readPathAliases,
    readWorkspaces,
    type SourceFile,
} from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import type { HexagonalWorkspaceSources } from "../../domain/hexagonalWorkspaceSources";
import type { RoleFolderSources } from "../../port/RoleFolderSources";

export class EngineRoleFolderSources implements RoleFolderSources {
    read(repoRoot: string): readonly HexagonalWorkspaceSources[] {
        const files = trackedFiles(repoRoot);
        const tsconfig = join(repoRoot, "tsconfig.base.json");
        const aliases = existsSync(tsconfig) ? readPathAliases(readFileSync(tsconfig, "utf8")) : [];
        const workspaces = readWorkspaces(repoRoot)
            .filter(({ kind }) => kind === "hexagonal")
            .map(({ dir }) => {
                const sourceRoot = `${dir}/src/`;
                const tree = files
                    .filter(
                        (path) =>
                            path.startsWith(sourceRoot) &&
                            isTypeScriptSource(path.slice(dir.length + 1)),
                    )
                    .map((path): SourceFile => ({
                        path,
                        text: readFileSync(join(repoRoot, path), "utf8"),
                    }));
                return { dir, sourceRoot, tree };
            });
        const implementations = findImplementations(
            workspaces.flatMap(({ tree }) => tree),
            { aliases },
        );
        return workspaces.map(({ dir, sourceRoot, tree }) => ({
            dir,
            graph: buildImportGraph(
                tree.map(({ path, text }) => ({ path: path.slice(sourceRoot.length), text })),
            ),
            implementations: implementations.filter(({ path }) => path.startsWith(sourceRoot)),
        }));
    }
}
