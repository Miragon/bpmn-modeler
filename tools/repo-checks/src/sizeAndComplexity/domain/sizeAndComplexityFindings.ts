import type { Finding } from "../../fitness/domain/finding";
import type { FindingGroup, FindingValue } from "../../fitness/domain/fitnessFunction";
import {
    complexityPhrase,
    type FileMeasure,
    findingLine,
    mostComplexFunction,
} from "../../sourceFiles/domain/fileMeasure";

export const SIZE_AND_COMPLEXITY_VALUES: readonly [FindingValue, FindingValue] = [
    { id: "codeLines", title: "code lines" },
    { id: "complexity", title: "highest complexity" },
];

function valuesOf(file: FileMeasure): Record<string, number> {
    const most = mostComplexFunction(file);
    return most === undefined
        ? { codeLines: file.codeLines }
        : { codeLines: file.codeLines, complexity: most.complexity };
}

// One row per file is too long to read unfolded; the counts above it name the new ones.
export const SIZE_AND_COMPLEXITY_GROUPS: readonly [FindingGroup] = [
    { id: "files", title: "Every measured file", collapsed: true },
];

export function sizeAndComplexityFindings(files: readonly FileMeasure[]): Finding[] {
    return files.map((file) => ({
        key: file.path,
        path: file.path,
        line: findingLine(file),
        message: `${file.codeLines} code lines; ${complexityPhrase(file)}`,
        values: valuesOf(file),
        group: "files",
    }));
}
