// Grouped by hand: the report must not depend on the machine's locale.
export function groupedDigits(count: number): string {
    return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
