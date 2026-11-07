import { compareText, type Finding } from "../../fitness/domain/finding";
import { lift, type MissedPartner } from "./missedPartners";

function code(path: string): string {
    return `\`${path}\``;
}

// Confidences compared by cross-multiplying, so equal ratios tie exactly.
function compareByConfidenceThenLift(left: MissedPartner, right: MissedPartner): number {
    return (
        right.sharedChanges * left.fileRevisions - left.sharedChanges * right.fileRevisions ||
        lift(right) - lift(left) ||
        compareText(left.file, right.file) ||
        compareText(left.partner, right.partner)
    );
}

export function missedPartnerFindings(pairs: readonly MissedPartner[]): Finding[] {
    return [...pairs].sort(compareByConfidenceThenLift).map((pair, index) => ({
        key: `${pair.file} → ${pair.partner}`,
        path: pair.file,
        paths: [pair.file, pair.partner],
        line: 1,
        message: `${code(pair.file)} changed; in ${pair.sharedChanges} of ${pair.fileRevisions} changes to ${code(pair.file)}, ${code(pair.partner)} changed too (lift ${lift(pair).toFixed(1)})`,
        rank: index + 1,
    }));
}
