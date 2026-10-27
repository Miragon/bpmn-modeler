/** Shortens `value` to at most `maxLength` characters, marking a cut with `…`. */
export function truncateForDisplay(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function referenceForDisplay(reference: string): string {
    return reference;
}
