import { compareText, type Finding } from "../../fitness/domain/finding";
import { groupedDigits } from "../../fitness/domain/numberText";
import {
    changesetsAtTodaysPaths,
    type CommitRecord,
    isMechanicalCommit,
} from "../../history/domain/commitHistory";
import {
    complexityPhrase,
    type FileMeasure,
    findingLine,
} from "../../sourceFiles/domain/fileMeasure";

export const HOTSPOT_LIMIT = 20;

export interface Hotspot {
    readonly file: FileMeasure;
    readonly revisions: number;
    readonly score: number;
    /** 1 is the hottest. */
    readonly rank: number;
}

type UnrankedHotspot = Omit<Hotspot, "rank">;

function compareHotspots(left: UnrankedHotspot, right: UnrankedHotspot): number {
    return (
        right.score - left.score ||
        right.revisions - left.revisions ||
        right.file.codeLines - left.file.codeLines ||
        compareText(left.file.path, right.file.path)
    );
}

/**
 * Score = revisions × code lines, the two dimensions Tornhill's hotspot view encodes. Unlike change
 * coupling, a large changeset counts: code-maat cuts changeset size for coupling only.
 */
export function rankHotspots(
    windowNewestFirst: readonly CommitRecord[],
    files: readonly FileMeasure[],
    limit = HOTSPOT_LIMIT,
): Hotspot[] {
    const revisions = new Map<string, number>();
    for (const { subject, paths } of changesetsAtTodaysPaths(
        windowNewestFirst,
        files.map(({ path }) => path),
    )) {
        if (!isMechanicalCommit(subject)) {
            for (const path of paths) {
                revisions.set(path, (revisions.get(path) ?? 0) + 1);
            }
        }
    }
    return files
        .flatMap((file): UnrankedHotspot[] => {
            const count = revisions.get(file.path) ?? 0;
            // A barrel changes whenever its exports change and holds no rule to find.
            return count === 0 || file.barrel
                ? []
                : [{ file, revisions: count, score: count * file.codeLines }];
        })
        .sort(compareHotspots)
        .slice(0, limit)
        .map((hotspot, index) => ({ ...hotspot, rank: index + 1 }));
}

export function hotspotFindings(hotspots: readonly Hotspot[]): Finding[] {
    return hotspots.map(({ file, revisions, score, rank }) => ({
        key: file.path,
        path: file.path,
        paths: [file.path],
        line: findingLine(file),
        message: `${revisions} ${revisions === 1 ? "revision" : "revisions"} × ${file.codeLines} code lines = ${groupedDigits(score)}; ${complexityPhrase(file)}`,
        rank,
    }));
}
