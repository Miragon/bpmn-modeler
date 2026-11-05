export interface MutationTally {
    readonly detected: number;
    readonly undetected: number;
}

export function hasScore({ detected, undetected }: MutationTally): boolean {
    return detected + undetected > 0;
}

export function percent({ detected, undetected }: MutationTally): string {
    return `${((100 * detected) / (detected + undetected)).toFixed(1)} %`;
}

export function totalOf(tallies: readonly MutationTally[]): MutationTally {
    return tallies.reduce(
        (sum, { detected, undetected }) => ({
            detected: sum.detected + detected,
            undetected: sum.undetected + undetected,
        }),
        { detected: 0, undetected: 0 },
    );
}
