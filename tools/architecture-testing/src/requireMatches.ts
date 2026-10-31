/** An empty scope means a renamed folder or a pattern that matches nothing, so the rule would pass vacuously. */
export function requireMatches<Items extends Iterable<unknown>>(
    scope: string,
    items: Items,
): Items {
    if (items[Symbol.iterator]().next().done) {
        throw new Error(`${scope} matched nothing; the rule over it would pass vacuously`);
    }
    return items;
}
