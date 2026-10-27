const REFERENCE_DISPLAY_LIMIT = 100;

/** Shortens `value` to at most `maxLength` characters, marking a cut with `…`. */
export function truncateForDisplay(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

/** A reference as every notification and log line echoes it. */
export function referenceForDisplay(reference: string): string {
    return truncateForDisplay(reference, REFERENCE_DISPLAY_LIMIT);
}
