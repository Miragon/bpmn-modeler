export interface DirectedEdge {
    readonly from: string;
    readonly to?: string;
}

/**
 * One sorted entry per strongly connected component, however many imports
 * close it, ordered by its first member. Edges without `to` are ignored.
 */
export function findImportCycles(edges: readonly DirectedEdge[]): string[][] {
    const successors = successorsOf(edges);
    const index = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const cycles: string[][] = [];

    const visit = (node: string): void => {
        index.set(node, index.size);
        lowLink.set(node, index.get(node)!);
        stack.push(node);
        onStack.add(node);
        for (const next of successors.get(node) ?? []) {
            if (!index.has(next)) {
                visit(next);
                lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(next)!));
            } else if (onStack.has(next)) {
                lowLink.set(node, Math.min(lowLink.get(node)!, index.get(next)!));
            }
        }
        if (lowLink.get(node) !== index.get(node)) {
            return;
        }
        const component: string[] = [];
        let member: string;
        do {
            member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
        } while (member !== node);
        if (component.length > 1 || successors.get(node)!.has(node)) {
            cycles.push(component.sort());
        }
    };

    for (const node of successors.keys()) {
        if (!index.has(node)) {
            visit(node);
        }
    }
    return cycles.sort((left, right) => (left[0] < right[0] ? -1 : 1));
}

function successorsOf(edges: readonly DirectedEdge[]): Map<string, Set<string>> {
    const successors = new Map<string, Set<string>>();
    for (const { from, to } of edges) {
        if (to === undefined) {
            continue;
        }
        successors.set(from, (successors.get(from) ?? new Set()).add(to));
        if (!successors.has(to)) {
            successors.set(to, new Set());
        }
    }
    return successors;
}
