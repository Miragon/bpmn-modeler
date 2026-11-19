/**
 * Moves every 200th task of a generated large model by the offset, onto or beside its
 * neighbours, its flows left where they were: five tasks in a file of 1,400 nodes.
 */
export function withShiftedTasks(xml: string, dx: number, dy: number): string {
    let ordinal = 0;
    return xml.replace(
        /(bpmnElement="(?:svc|user)_\d+_\d+"><dc:Bounds x=")(\d+)(" y=")(\d+)"/g,
        (match, prefix: string, x: string, between: string, y: string) =>
            ++ordinal % 200 === 0
                ? `${prefix}${Number(x) + dx}${between}${Number(y) + dy}"`
                : match,
    );
}
