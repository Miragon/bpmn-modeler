import {
    readCodeLines,
    readFunctionComplexities,
    readModuleSymbols,
    readWorkspaceDirs,
} from "@miragon/architecture-testing";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import type { FileMeasure } from "../../domain/fileMeasure";
import { measuredTypeScriptFiles } from "../../domain/sourceFiles";
import type { SourceMeasures } from "../../port/SourceMeasures";

export class EngineSourceMeasures implements SourceMeasures {
    read(repoRoot: string): readonly FileMeasure[] {
        return measuredTypeScriptFiles(trackedFiles(repoRoot), readWorkspaceDirs(repoRoot))
            .sort()
            .map((path) => {
                const text = readFileSync(join(repoRoot, path), "utf8");
                return {
                    path,
                    codeLines: readCodeLines(path, text),
                    functions: readFunctionComplexities(path, text),
                    barrel: readModuleSymbols(path, text).declaresNothing,
                };
            });
    }
}
