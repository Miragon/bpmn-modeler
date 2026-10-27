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
 */
export function commentAndCdataRanges(content: string): TextRange[] {
    const ranges: TextRange[] = [];
    let cursor = 0;
    for (;;) {
        const start = content.indexOf(SECTION_OPENER_PREFIX, cursor);
        if (start === -1) {
            return ranges;
        }
        cursor = start + SECTION_OPENER_PREFIX.length;
        const section = SECTIONS.find(({ open }) => content.startsWith(open, start));
        if (!section) {
            continue;
        }
        const close = content.indexOf(section.close, start + section.open.length);
        if (close === -1) {
            ranges.push([start, content.length]);
            return ranges;
        }
        cursor = close + section.close.length;
        ranges.push([start, cursor]);
    }
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
