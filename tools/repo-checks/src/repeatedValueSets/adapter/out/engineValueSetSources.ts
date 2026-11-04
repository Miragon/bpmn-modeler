import { readValueSets } from "@miragon/architecture-testing";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import { isValueSetSource, type ValueSetOccurrence } from "../../domain/repeatedValueSets";
import type { ValueSetSources } from "../../port/ValueSetSources";

export class EngineValueSetSources implements ValueSetSources {
    read(repoRoot: string): readonly ValueSetOccurrence[] {
        return trackedFiles(repoRoot)
            .filter(isValueSetSource)
            .flatMap((path) =>
                readValueSets(path, readFileSync(join(repoRoot, path), "utf8")).map(
                    ({ line, values }) => ({ path, line, values }),
                ),
            );
    }
}
