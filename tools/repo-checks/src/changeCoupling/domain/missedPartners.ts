import { compareText } from "../../fitness/domain/finding";
import {
    type Changeset,
    changesetsAtTodaysPaths,
    type CommitRecord,
    type FileChange,
    withBranchAsOneChange,
} from "../../history/domain/commitHistory";
import { CODE_MAAT_THRESHOLDS, countedChangesets } from "./changeCoupling";
import { measuredFiles, type SourceLayout } from "./sourceLayout";

export interface MissedPartnerThresholds {
    readonly minSharedChanges: number;
    readonly minConfidencePercent: number;
    /** Compared as shared × counted changesets ≥ minLift × both files' revisions, so an integer. */
    readonly minLift: number;
    readonly maxChangesetSize: number;
}

export const MISSED_PARTNER_THRESHOLDS: MissedPartnerThresholds = {
    minSharedChanges: CODE_MAAT_THRESHOLDS.minSharedChanges,
    // The replay's widest margin over chance at lift 4; above 60 % warnings fall, the margin does not grow.
    minConfidencePercent: 60,
    // Barely binds at 60 % in the replay; it keeps out a partner that changes in most commits.
    minLift: 4,
    maxChangesetSize: CODE_MAAT_THRESHOLDS.maxChangesetSize,
};

export interface MissedPartner {
    readonly file: string;
    readonly partner: string;
    readonly sharedChanges: number;
    readonly fileRevisions: number;
    readonly partnerRevisions: number;
    readonly countedChangesets: number;
}

export interface MissedPartnersInput {
    /** At today's paths. */
    readonly change: readonly string[];
    readonly history: readonly Pick<Changeset, "subject" | "paths">[];
    readonly measuredFiles: ReadonlySet<string>;
    readonly thresholds: MissedPartnerThresholds;
}

export function lift(pair: MissedPartner): number {
    return (
        (pair.sharedChanges * pair.countedChangesets) / (pair.fileRevisions * pair.partnerRevisions)
    );
}

export function meetsThresholds(
    { sharedChanges, fileRevisions, partnerRevisions, countedChangesets }: MissedPartner,
    { minSharedChanges, minConfidencePercent, minLift }: MissedPartnerThresholds,
): boolean {
    return (
        sharedChanges >= minSharedChanges &&
        sharedChanges * 100 >= minConfidencePercent * fileRevisions &&
        sharedChanges * countedChangesets >= minLift * fileRevisions * partnerRevisions
    );
}

export function missedPartners({
    change,
    history,
    measuredFiles,
    thresholds,
}: MissedPartnersInput): MissedPartner[] {
    const changed = new Set(change);
    const counted = countedChangesets(history, measuredFiles, thresholds.maxChangesetSize);
    const revisions = new Map<string, number>();
    const sharedByFile = new Map<string, Map<string, number>>();
    for (const files of counted) {
        for (const file of files) {
            revisions.set(file, (revisions.get(file) ?? 0) + 1);
        }
        const partners = files.filter((file) => !changed.has(file));
        for (const file of files.filter((file) => changed.has(file))) {
            const shared = sharedByFile.get(file) ?? new Map<string, number>();
            for (const partner of partners) {
                shared.set(partner, (shared.get(partner) ?? 0) + 1);
            }
            sharedByFile.set(file, shared);
        }
    }
    return [...sharedByFile]
        .sort(([left], [right]) => compareText(left, right))
        .flatMap(([file, shared]) =>
            [...shared]
                .sort(([left], [right]) => compareText(left, right))
                .map(([partner, sharedChanges]): MissedPartner => ({
                    file,
                    partner,
                    sharedChanges,
                    fileRevisions: revisions.get(file) as number,
                    partnerRevisions: revisions.get(partner) as number,
                    countedChangesets: counted.length,
                })),
        )
        .filter((pair) => meetsThresholds(pair, thresholds));
}

/** The change goes first, so its renames are followed into the window and its deletions drop out. */
export function missedPartnersOfChange(
    layout: SourceLayout,
    change: readonly FileChange[],
    windowNewestFirst: readonly CommitRecord[],
): MissedPartner[] {
    if (change.length === 0) {
        return [];
    }
    const [branchChange, ...history] = changesetsAtTodaysPaths(
        withBranchAsOneChange(windowNewestFirst, change),
        layout.files,
    );
    return missedPartners({
        change: branchChange.paths,
        history,
        measuredFiles: measuredFiles(layout),
        thresholds: MISSED_PARTNER_THRESHOLDS,
    });
}
