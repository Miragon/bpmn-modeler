import type { CandidateOutcome, MissedPartnerReplay } from "./missedPartnerReplay";

function percent(share: number | undefined): string {
    return share === undefined ? "–" : `${(share * 100).toFixed(1)} %`;
}

function points(share: number | undefined): string {
    return share === undefined ? "–" : `${(share * 100).toFixed(1)}`;
}

function row({
    candidate,
    chosen,
    warnings,
    hits,
    precision,
    chanceRate,
    margin,
}: CandidateOutcome) {
    return `| ${candidate.minConfidencePercent} % | ${candidate.minLift} | ${warnings} | ${hits} | ${percent(precision)} | ${percent(chanceRate)} | ${points(margin)} | ${chosen ? "chosen" : ""} |`;
}

export function missedPartnerReplayTable({
    head,
    replayedCommits,
    lookAhead,
    outcomes,
}: MissedPartnerReplay): string {
    return [
        "## missed-partner replay",
        "",
        `HEAD \`${head}\`, ${replayedCommits} replayed commits, a hit within the next ${lookAhead} commits.`,
        "",
        "| Confidence | Lift | Warnings | Hits | Precision | Chance | Margin (points) | |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ...outcomes.map(row),
        "",
    ].join("\n");
}
