import { describe, expect, it } from "vitest";

import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types/domain";

import { mergeSideName, mergeSideTitle } from "./mergeSideNames";

const CAPTIONS: Record<MergeSide, MergeSideCaption> = {
    current: { side: "current", role: "branch", ref: "main", shortHash: "1111111" },
    incoming: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
};

describe("mergeSideName", () => {
    it.each<{ side: string; caption: MergeSideCaption; name: string }>([
        { side: "a branch at a commit by the branch", caption: CAPTIONS.current, name: "main" },
        {
            side: "a commit no branch names by the commit",
            caption: { side: "incoming", role: "yourCommit", shortHash: "5d6e7f8" },
            name: "5d6e7f8",
        },
        {
            side: "a side Git names by neither by its position",
            caption: { side: "incoming", role: "stash" },
            name: "Incoming",
        },
    ])("names $side", ({ caption, name }) => {
        expect(mergeSideName(caption)).toBe(name);
    });
});

describe("mergeSideTitle", () => {
    it.each<{ side: string; caption: MergeSideCaption; title: ReturnType<typeof mergeSideTitle> }>([
        {
            side: "a branch at a commit",
            caption: { ...CAPTIONS.current, subject: "Pack the parcel" },
            title: { title: "Current", ref: "main", shortHash: "1111111" },
        },
        {
            side: "the other branch of a merge",
            caption: CAPTIONS.incoming,
            title: { title: "Incoming", ref: "feature", shortHash: "9f8e7d6" },
        },
        {
            side: "a rebase's own commit, which Git names by no branch",
            caption: { side: "incoming", role: "yourCommit", shortHash: "5d6e7f8" },
            title: { title: "Incoming", shortHash: "5d6e7f8" },
        },
        {
            side: "a side read from a conflict marker's label, without a commit",
            caption: { side: "current", role: "unknown", ref: "Updated upstream" },
            title: { title: "Current", ref: "Updated upstream" },
        },
        {
            side: "a stash, which Git gives neither a branch nor a commit",
            caption: { side: "incoming", role: "stash" },
            title: { title: "Incoming" },
        },
    ])("titles $side by its position, then by what Git names it", ({ caption, title }) => {
        expect(mergeSideTitle(caption)).toStrictEqual(title);
    });
});
