import { describe, expect, it } from "vitest";

import { mergeEditorInputTitle } from "./mergeEditorInputTitle";

describe("mergeEditorInputTitle", () => {
    it.each([
        {
            side: "a branch at a commit",
            title: { title: "Current", ref: "main", shortHash: "1a2b3c4" },
            shown: { title: "Current", description: "$(git-commit) 1a2b3c4", detail: "main" },
        },
        {
            side: "a commit no branch names, as during a rebase",
            title: { title: "Incoming", shortHash: "5d6e7f8" },
            shown: { title: "Incoming", description: "$(git-commit) 5d6e7f8" },
        },
        {
            side: "a name without a commit, as a conflict marker's label",
            title: { title: "Incoming", ref: "Stashed changes" },
            shown: { title: "Incoming", detail: "Stashed changes" },
        },
        {
            side: "a side Git names by neither",
            title: { title: "Incoming" },
            shown: { title: "Incoming" },
        },
    ])("titles $side as VS Code's Git merge editor does", ({ title, shown }) => {
        expect(mergeEditorInputTitle(title)).toStrictEqual(shown);
    });

    it.each([
        { ref: "fix/$(bug)", detail: "fix/\\$(bug)" },
        { ref: "$(sync~spin)-retry", detail: "\\$(sync~spin)-retry" },
        { ref: "$(a)$(b)", detail: "\\$(a)\\$(b)" },
        { ref: "price-in-$", detail: "price-in-$" },
        { ref: "$(not an icon)", detail: "$(not an icon)" },
    ])(
        "keeps the branch $ref as Git wrote it where VS Code would draw an icon",
        ({ ref, detail }) => {
            expect(mergeEditorInputTitle({ title: "Current", ref }).detail).toBe(detail);
        },
    );
});
