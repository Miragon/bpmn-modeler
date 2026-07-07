/**
 * A minimal, linear-time glob matcher for narrowing which files a marketplace
 * source contributes (`include` patterns on a `sources[]` entry).
 *
 * Why hand-rolled instead of a library or `new RegExp`: the patterns come from a
 * hand-edited `marketplace.json` — hostile input. Compiling a glob into a
 * backtracking regex reopens the polynomial-ReDoS hole that the rest of
 * `marketplace.ts` deliberately avoids (`js/polynomial-redos`). This matcher is
 * two nested dynamic-programming passes with rolling rows, so its cost is
 * strictly `O(patternSegments · pathSegments)` at the path level and
 * `O(patternChars · textChars)` at the segment level — no backtracking, immune
 * to a crafted pattern by construction. Being pure with zero imports, it also
 * satisfies the domain layer's no-host-module rule.
 */

/**
 * Supported syntax (a deliberately small subset):
 * - `**` — a whole path segment matching any depth, *including zero* segments.
 * - `*` — any run of characters *within* one segment (never crosses `/`).
 * - `?` — exactly one character within a segment (never `/`).
 * - anything else is a literal; matching is case-sensitive.
 *
 * `pattern` and `path` are both compared as `/`-separated segment lists relative
 * to the source subtree, so a pattern never repeats the source's `path` prefix.
 */
export function matchesGlob(pattern: string, path: string): boolean {
    // `""` is zero segments (the subtree root), not one empty segment — otherwise
    // an all-`**` pattern would spuriously fail to match the root itself.
    const patternSegments = pattern.length === 0 ? [] : pattern.split("/");
    const pathSegments = path.length === 0 ? [] : path.split("/");
    return segmentsMatch(patternSegments, pathSegments);
}

/**
 * Segment-level DP: `row[j]` = "the pattern segments seen so far match the first
 * `j` path segments". A `**` segment either consumes zero path segments (carry
 * the value straight down from the previous pattern row) or one more (carry it
 * left along the current row); a literal/wildcard segment advances both lists by
 * one only when the segment itself matches. Rolling two rows keeps it linear in
 * pattern length.
 */
function segmentsMatch(patternSegments: string[], pathSegments: string[]): boolean {
    const pathCount = pathSegments.length;
    let previous = new Array<boolean>(pathCount + 1).fill(false);
    previous[0] = true; // zero pattern segments match zero path segments

    for (const patternSegment of patternSegments) {
        const current = new Array<boolean>(pathCount + 1).fill(false);
        if (patternSegment === "**") {
            for (let j = 0; j <= pathCount; j++) {
                current[j] = previous[j] || (j > 0 && current[j - 1]);
            }
        } else {
            // A non-`**` segment cannot match zero path segments, so current[0]
            // stays false; each j pairs pattern segment i with path segment j.
            for (let j = 1; j <= pathCount; j++) {
                current[j] =
                    previous[j - 1] && segmentCharsMatch(patternSegment, pathSegments[j - 1]);
            }
        }
        previous = current;
    }
    return previous[pathCount];
}

/**
 * Char-level DP inside one segment, same rolling-row shape as {@link segmentsMatch}:
 * `*` consumes zero-or-more chars, `?` exactly one, everything else a literal.
 * The pattern here never contains `/` (segments were split on it), so this can
 * never let a wildcard cross a separator.
 */
function segmentCharsMatch(patternSegment: string, textSegment: string): boolean {
    const textLength = textSegment.length;
    let previous = new Array<boolean>(textLength + 1).fill(false);
    previous[0] = true;

    for (let i = 0; i < patternSegment.length; i++) {
        const patternChar = patternSegment[i];
        const current = new Array<boolean>(textLength + 1).fill(false);
        if (patternChar === "*") {
            for (let j = 0; j <= textLength; j++) {
                current[j] = previous[j] || (j > 0 && current[j - 1]);
            }
        } else if (patternChar === "?") {
            for (let j = 1; j <= textLength; j++) {
                current[j] = previous[j - 1];
            }
        } else {
            for (let j = 1; j <= textLength; j++) {
                current[j] = previous[j - 1] && patternChar === textSegment[j - 1];
            }
        }
        previous = current;
    }
    return previous[textLength];
}
