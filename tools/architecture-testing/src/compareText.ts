// Code-unit order, not localeCompare: the result must not depend on the machine's locale.
export function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
