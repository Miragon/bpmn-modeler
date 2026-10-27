import { describe, expect, it } from "vitest";

import {
    commentAndCdataRanges,
    containsCommentOrCdataClose,
    isInsideRanges,
    matchesOutsideCommentsAndCdata,
} from "./xmlMarkup";

function hiddenSections(content: string): string[] {
    return commentAndCdataRanges(content).map(([start, end]) => content.slice(start, end));
}

describe("commentAndCdataRanges", () => {
    it.each([
        { case: "nothing in plain markup", content: `<bpmn:process id="B"/>`, hidden: [] },
        {
            case: "a comment",
            content: `a<!-- <bpmn:process id="B"/> -->b`,
            hidden: [`<!-- <bpmn:process id="B"/> -->`],
        },
        { case: "a CDATA section", content: `a<![CDATA[ x ]]>b`, hidden: [`<![CDATA[ x ]]>`] },
        {
            case: "the shortest comment and CDATA section",
            content: `<!----><![CDATA[]]>`,
            hidden: [`<!---->`, `<![CDATA[]]>`],
        },
        {
            case: "no other markup declaration",
            content: `<!DOCTYPE x><!-- c -->`,
            hidden: [`<!-- c -->`],
        },
    ])("hides $case", ({ content, hidden }) => {
        expect(hiddenSections(content)).toEqual(hidden);
    });

    it("a comment opener inside CDATA does not hide markup after the section", () => {
        const content = `<![CDATA[ log("<!--"); ]]><bpmn:process id="B"/><!-- note -->`;

        expect(hiddenSections(content)).toEqual([`<![CDATA[ log("<!--"); ]]>`, `<!-- note -->`]);
    });

    it("a CDATA opener inside a comment opens nothing", () => {
        const content = `<!-- <![CDATA[ --><bpmn:process id="B"/>]]>`;

        expect(hiddenSections(content)).toEqual([`<!-- <![CDATA[ -->`]);
    });

    it.each([
        { section: "comment", content: `String opener = "<!--"; @Service("b")`, hidden: [] },
        { section: "CDATA section", content: `<![CDATA[ <bpmn:process id="B"/>`, hidden: [] },
        {
            section: "comment after a closed one",
            content: `<!-- a --> "<!--" <x id="B"/>`,
            hidden: [`<!-- a -->`],
        },
        {
            section: "comment that only its own opener's dashes would close",
            content: `<!--> <x id="B"/>`,
            hidden: [],
        },
    ])("an unterminated $section hides nothing", ({ content, hidden }) => {
        expect(hiddenSections(content)).toEqual(hidden);
    });

    it("still hides the other kind after an unterminated opener", () => {
        expect(hiddenSections(`"<!--" <![CDATA[ x ]]>`)).toEqual([`<![CDATA[ x ]]>`]);
        expect(hiddenSections(`<![CDATA[ <!-- x -->`)).toEqual([`<!-- x -->`]);
    });

    it("stays fast on pathological input", () => {
        const startedAt = Date.now();

        commentAndCdataRanges("<!--".repeat(100_000));
        commentAndCdataRanges("<![CDATA[".repeat(100_000));
        commentAndCdataRanges("<!--<![CDATA[".repeat(50_000));

        expect(Date.now() - startedAt).toBeLessThan(1000);
    });
});

describe("containsCommentOrCdataClose", () => {
    it.each([
        { text: "a-->b", contains: true },
        { text: "a]]>b", contains: true },
        { text: "a->b", contains: false },
        { text: "a]]b", contains: false },
        { text: "<!--<![CDATA[", contains: false },
        { text: "", contains: false },
    ])("is $contains for '$text'", ({ text, contains }) => {
        expect(containsCommentOrCdataClose(text)).toBe(contains);
    });
});

describe("isInsideRanges", () => {
    it.each([
        { offset: 1, inside: false },
        { offset: 2, inside: true },
        { offset: 4, inside: true },
        { offset: 5, inside: false },
    ])("counts offset $offset as inside [2, 5): $inside", ({ offset, inside }) => {
        expect(isInsideRanges([[2, 5]], offset)).toBe(inside);
    });

    it.each([
        { offset: 0, inside: false },
        { offset: 2, inside: true },
        { offset: 6, inside: false },
        { offset: 7, inside: true },
        { offset: 8, inside: true },
        { offset: 9, inside: false },
        { offset: 12, inside: true },
        { offset: 19, inside: true },
        { offset: 20, inside: false },
    ])(
        "counts offset $offset as inside [2, 5), [7, 9), [12, 20): $inside",
        ({ offset, inside }) => {
            const ranges = [
                [2, 5],
                [7, 9],
                [12, 20],
            ] as const;

            expect(isInsideRanges(ranges, offset)).toBe(inside);
        },
    );

    it("counts nothing as inside no ranges", () => {
        expect(isInsideRanges([], 0)).toBe(false);
    });
});

describe("matchesOutsideCommentsAndCdata", () => {
    it.each([
        { case: "a match only in a comment", content: `<!-- id="B" -->`, matches: false },
        { case: "a match only in CDATA", content: `<![CDATA[ id="B" ]]>`, matches: false },
        { case: "no match", content: `id="A"`, matches: false },
        {
            case: "a match after one in a comment",
            content: `<!-- id="B" --> id="B"`,
            matches: true,
        },
        {
            case: "a match after CDATA holding a comment opener",
            content: `<![CDATA[ "<!--" ]]> id="B" <!-- note -->`,
            matches: true,
        },
        {
            case: "a match after an unterminated comment opener",
            content: `"<!--" id="B"`,
            matches: true,
        },
    ])("is $matches for $case", ({ content, matches }) => {
        expect(matchesOutsideCommentsAndCdata(content, /id="B"/)).toBe(matches);
    });

    it("accepts a global pattern", () => {
        expect(matchesOutsideCommentsAndCdata(`<!-- id="B" --> id="B"`, /id="B"/g)).toBe(true);
    });

    it("keeps the pattern's flags", () => {
        expect(matchesOutsideCommentsAndCdata(`ID="b"`, /id="B"/i)).toBe(true);
    });

    it("stays fast on many sections that hide many matches", () => {
        const content = "<!---->".repeat(80_000) + `<!-- id="B" -->`.repeat(40_000);
        const startedAt = Date.now();

        expect(matchesOutsideCommentsAndCdata(content, /id="B"/)).toBe(false);

        expect(Date.now() - startedAt).toBeLessThan(1000);
    });
});
