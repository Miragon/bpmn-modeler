import { findTypeEqualityPins, readPathAliases, readValueSets } from "@miragon/architecture-testing";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import { isValueSetSource, type ValueSetInventory } from "../../domain/repeatedValueSets";
import type { ValueSetSources } from "../../port/ValueSetSources";

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;

export class EngineValueSetSources implements ValueSetSources {
    read(repoRoot: string): ValueSetInventory {
        const scripts = trackedFiles(repoRoot)
            .filter((path) => SCRIPT_FILE.test(path))
            .map((path) => ({ path, text: readFileSync(join(repoRoot, path), "utf8") }));
        const tsconfig = join(repoRoot, "tsconfig.base.json");
        const aliases = existsSync(tsconfig) ? readPathAliases(readFileSync(tsconfig, "utf8")) : [];
        return {
            occurrences: scripts
                .filter(({ path }) => isValueSetSource(path))
                .flatMap(({ path, text }) =>
                    readValueSets(path, text).map(({ line, values }) => ({ path, line, values })),
                ),
            pins: findTypeEqualityPins(scripts, { aliases }).flatMap(
                ({ actualFiles, expectedFiles }) =>
                    actualFiles.flatMap((path) =>
                        expectedFiles.map((pinnedPath) => ({ path, pinnedPath })),
                    ),
            ),
        };
    }
}
