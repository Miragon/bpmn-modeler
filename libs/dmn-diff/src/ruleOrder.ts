/**
 * The ids, in `after` order, whose position among the ids both orders share
 * changed: the shared ids outside a longest common subsequence.
 *
 * On a tie the subsequence gives up the later id of `before`, so a rule pulled
 * up counts as moved, not every rule it passed.
 */
export function movedIds(before: readonly string[], after: readonly string[]): string[] {
    const inBefore = new Set(before);
    const inAfter = new Set(after);
    const from = before.filter((id) => inAfter.has(id));
    const to = after.filter((id) => inBefore.has(id));

    const lengths = Array.from({ length: from.length + 1 }, () => new Uint32Array(to.length + 1));
    for (let i = 1; i <= from.length; i++) {
        for (let j = 1; j <= to.length; j++) {
            lengths[i][j] =
                from[i - 1] === to[j - 1]
                    ? lengths[i - 1][j - 1] + 1
                    : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
        }
    }

    const kept = new Set<string>();
    let i = from.length;
    let j = to.length;
    while (i > 0 && j > 0) {
        if (from[i - 1] === to[j - 1]) {
            kept.add(from[i - 1]);
            i--;
            j--;
        } else if (lengths[i - 1][j] >= lengths[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    return to.filter((id) => !kept.has(id));
}
