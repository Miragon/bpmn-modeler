/** Most severe first. */
const SEVERITIES = ["error", "warning", "info"] as const;

export type Severity = (typeof SEVERITIES)[number];

interface Severe {
    severity: Severity;
}

/** Sorts the most severe first; a stable sort keeps equals in their order. */
export function bySeverity(a: Severe, b: Severe): number {
    return SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
}

export function mostSevere<T extends Severe>(items: readonly T[]): T | undefined {
    return items.reduce<T | undefined>(
        (worst, next) => (worst && bySeverity(worst, next) <= 0 ? worst : next),
        undefined,
    );
}
