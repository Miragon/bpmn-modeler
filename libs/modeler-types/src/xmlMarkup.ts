export type TextRange = readonly [start: number, end: number];

const SECTION_OPENER_PREFIX = "<!";
const SECTIONS = [
    { open: "<!--", close: "-->" },
    { open: "<![CDATA[", close: "]]>" },
] as const;

/**
 * The XML comment and CDATA sections of `content`, in document order. Markup
 * inside one is commented out, not real; enumerated rather than stripped so
 * offsets stay valid.
 *
 * One forward scan, so an opener inside another section opens nothing. An
 * unterminated section hides nothing: code-link scans source files, where a
 * bare `<!--` string literal is ordinary code.
 */
export function commentAndCdataRanges(content: string): TextRange[] {
    const ranges: TextRange[] = [];
    // Once one opener finds no close, no later opener of its kind can; searching
    // again for each would be quadratic on hostile workspace files.
    const unterminated = new Set<string>();
    let cursor = 0;
    for (;;) {
        const start = content.indexOf(SECTION_OPENER_PREFIX, cursor);
        if (start === -1) {
            return ranges;
        }
        cursor = start + SECTION_OPENER_PREFIX.length;
        const section = SECTIONS.find(
            ({ open }) => !unterminated.has(open) && content.startsWith(open, start),
        );
        if (!section) {
            continue;
        }
        const close = content.indexOf(section.close, start + section.open.length);
        if (close === -1) {
            unterminated.add(section.open);
            continue;
        }
        cursor = close + section.close.length;
        ranges.push([start, cursor]);
    }
}

export function containsCommentOrCdataClose(text: string): boolean {
    return SECTIONS.some(({ close }) => text.includes(close));
}

export function isInsideRanges(ranges: readonly TextRange[], offset: number): boolean {
    return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** Whether `pattern` matches at least once outside every comment and CDATA section. */
export function matchesOutsideCommentsAndCdata(content: string, pattern: RegExp): boolean {
    const sections = commentAndCdataRanges(content);
    const everyMatch = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    for (const { index } of content.matchAll(everyMatch)) {
        if (!isInsideRanges(sections, index)) {
            return true;
        }
    }
    return false;
}
