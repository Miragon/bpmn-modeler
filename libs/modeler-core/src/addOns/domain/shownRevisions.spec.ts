import { describe, expect, it } from "vitest";

import { ShownCode } from "./addOnCatalog";
import { ShownRevisions } from "./shownRevisions";

const shownOf = (name: string): ReadonlyMap<string, ShownCode> =>
    new Map([[`plugin:/p/${name}`, { kind: "plugin", id: `/p/${name}`, name }]]);

describe("ShownRevisions", () => {
    it("shows nothing before a revision is recorded", () => {
        const revisions = ShownRevisions.empty();

        expect([revisions.shownAt(1), revisions.latest()]).toEqual([undefined, new Map()]);
    });

    it("keeps what each revision showed and knows the latest", () => {
        const revisions = ShownRevisions.empty()
            .recorded(1, shownOf("a"))
            .recorded(2, shownOf("b"));

        expect([revisions.shownAt(1), revisions.shownAt(2), revisions.latest()]).toEqual([
            shownOf("a"),
            shownOf("b"),
            shownOf("b"),
        ]);
    });

    it("forgets the oldest revision beyond its limit", () => {
        const revisions = ShownRevisions.empty(2)
            .recorded(1, shownOf("a"))
            .recorded(2, shownOf("b"))
            .recorded(3, shownOf("c"));

        expect([revisions.shownAt(1), revisions.shownAt(2), revisions.shownAt(3)]).toEqual([
            undefined,
            shownOf("b"),
            shownOf("c"),
        ]);
    });

    it("keeps sixteen revisions unless told otherwise", () => {
        let revisions = ShownRevisions.empty();
        for (let revision = 1; revision <= 17; revision++) {
            revisions = revisions.recorded(revision, shownOf(String(revision)));
        }

        expect([revisions.shownAt(1), revisions.shownAt(2)]).toEqual([undefined, shownOf("2")]);
    });

    it("never changes a value it already handed out", () => {
        const first = ShownRevisions.empty().recorded(1, shownOf("a"));

        first.recorded(2, shownOf("b"));

        expect([first.shownAt(2), first.latest()]).toEqual([undefined, shownOf("a")]);
    });
});
