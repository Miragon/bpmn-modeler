import { compareText } from "../../fitness/domain/finding";
import {
    type Changeset,
    changesetsAtTodaysPaths,
    type CommitRecord,
    isMechanicalCommit,
} from "../../history/domain/commitHistory";
import {
    compositionRoots,
    type ImportLink,
    measuredFiles,
    type SourceLayout,
    workspaceDirOf,
} from "./sourceLayout";

export interface CouplingThresholds {
    readonly minSharedChanges: number;
    readonly minDegreePercent: number;
    readonly maxChangesetSize: number;
}

/** code-maat's defaults; its min-revs of 5 follows from the shared minimum. */
export const CODE_MAAT_THRESHOLDS: CouplingThresholds = {
    minSharedChanges: 5,
    minDegreePercent: 30,
    maxChangesetSize: 30,
};

type HiddenGroup = "kotlin-only" | "across-languages" | "across-workspaces" | "within-workspace";

type Coupling =
    | { readonly kind: "linked" }
    | { readonly kind: "explained"; readonly by: string; readonly coChanges: number }
    | { readonly kind: "hidden"; readonly group: HiddenGroup };

export interface CoupledPair {
    /** In code-unit order. */
    readonly files: readonly [string, string];
    readonly sharedChanges: number;
    readonly revisions: readonly [number, number];
    readonly degreePercent: number;
    readonly coupling: Coupling;
    readonly compositionRoots: readonly string[];
}

export interface ChangeCouplingInput {
    readonly changesets: readonly Pick<Changeset, "subject" | "paths">[];
    readonly measuredFiles: ReadonlySet<string>;
    readonly links: readonly ImportLink[];
    readonly workspaceDirs: readonly string[];
    readonly compositionRoots: ReadonlySet<string>;
    readonly thresholds: CouplingThresholds;
}

type Language = "kotlin" | "json" | "script";

const PAIR_SEPARATOR = "\0";

/** Renames are followed through every commit of the window, the ones not counted included. */
export function changeCouplingInTree(
    layout: SourceLayout,
    windowNewestFirst: readonly CommitRecord[],
): CoupledPair[] {
    return measureChangeCoupling({
        changesets: changesetsAtTodaysPaths(windowNewestFirst, layout.files),
        measuredFiles: measuredFiles(layout),
        links: layout.links,
        workspaceDirs: layout.workspaces.map(({ dir }) => dir),
        compositionRoots: compositionRoots(layout),
        thresholds: CODE_MAAT_THRESHOLDS,
    });
}

export function measureChangeCoupling(input: ChangeCouplingInput): CoupledPair[] {
    const counted = countedChangesets(input);
    const revisions = new Map<string, number>();
    const shared = new Map<string, number>();
    for (const files of counted) {
        for (const [index, file] of files.entries()) {
            revisions.set(file, (revisions.get(file) ?? 0) + 1);
            for (const partner of files.slice(index + 1)) {
                const key = `${file}${PAIR_SEPARATOR}${partner}`;
                shared.set(key, (shared.get(key) ?? 0) + 1);
            }
        }
    }

    const importsOf = importsByFile(input.links);
    const { minSharedChanges, minDegreePercent } = input.thresholds;
    return [...shared]
        .flatMap(([key, sharedChanges]): CoupledPair[] => {
            const [left, right] = key.split(PAIR_SEPARATOR);
            const leftRevisions = revisions.get(left) as number;
            const rightRevisions = revisions.get(right) as number;
            // Degree = shared ÷ mean revisions × 100, compared in integers.
            if (
                sharedChanges < minSharedChanges ||
                sharedChanges * 200 < minDegreePercent * (leftRevisions + rightRevisions)
            ) {
                return [];
            }
            return [
                {
                    files: [left, right],
                    sharedChanges,
                    revisions: [leftRevisions, rightRevisions],
                    degreePercent: Math.round(
                        (sharedChanges * 200) / (leftRevisions + rightRevisions),
                    ),
                    coupling: couplingOf(left, right, sharedChanges, counted, importsOf, input),
                    compositionRoots: [left, right].filter((file) =>
                        input.compositionRoots.has(file),
                    ),
                },
            ];
        })
        .sort(
            (first, second) =>
                compareText(first.files[0], second.files[0]) ||
                compareText(first.files[1], second.files[1]),
        );
}

/** The measured files of each changeset that is counted, sorted. */
function countedChangesets({
    changesets,
    measuredFiles,
    thresholds,
}: ChangeCouplingInput): string[][] {
    return changesets
        .filter(({ subject }) => !isMechanicalCommit(subject))
        .map(({ paths }) => paths.filter((path) => measuredFiles.has(path)).sort(compareText))
        .filter((files) => files.length <= thresholds.maxChangesetSize);
}

function importsByFile(links: readonly ImportLink[]): Map<string, Set<string>> {
    const importsOf = new Map<string, Set<string>>();
    for (const { from, to } of links) {
        const imports = importsOf.get(from) ?? new Set();
        imports.add(to);
        importsOf.set(from, imports);
    }
    return importsOf;
}

function couplingOf(
    left: string,
    right: string,
    sharedChanges: number,
    counted: readonly string[][],
    importsOf: ReadonlyMap<string, ReadonlySet<string>>,
    { workspaceDirs }: ChangeCouplingInput,
): Coupling {
    const leftImports = importsOf.get(left) ?? new Set<string>();
    const rightImports = importsOf.get(right) ?? new Set<string>();
    if (leftImports.has(right) || rightImports.has(left)) {
        return { kind: "linked" };
    }
    const together = counted.filter((files) => files.includes(left) && files.includes(right));
    const explanation = [...leftImports]
        .filter((file) => rightImports.has(file))
        .map((file) => ({
            by: file,
            coChanges: together.filter((files) => files.includes(file)).length,
        }))
        .filter(({ coChanges }) => coChanges * 2 >= sharedChanges)
        .sort(
            (first, second) =>
                second.coChanges - first.coChanges || compareText(first.by, second.by),
        )[0];
    if (explanation !== undefined) {
        return { kind: "explained", ...explanation };
    }
    return { kind: "hidden", group: hiddenGroupOf(left, right, workspaceDirs) };
}

// Kotlin files carry no import edges, so a Kotlin pair is always hidden and gets its own group.
function hiddenGroupOf(left: string, right: string, workspaceDirs: readonly string[]): HiddenGroup {
    const leftLanguage = languageOf(left);
    const rightLanguage = languageOf(right);
    if (leftLanguage === "kotlin" && rightLanguage === "kotlin") {
        return "kotlin-only";
    }
    if (leftLanguage !== rightLanguage) {
        return "across-languages";
    }
    return workspaceDirOf(left, workspaceDirs) === workspaceDirOf(right, workspaceDirs)
        ? "within-workspace"
        : "across-workspaces";
}

// TypeScript and JavaScript share one language: the engine reads imports in both.
function languageOf(path: string): Language {
    if (path.endsWith(".kt")) {
        return "kotlin";
    }
    return path.endsWith(".json") ? "json" : "script";
}
