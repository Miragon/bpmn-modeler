import { describe, expect, it } from "vitest";

import { ancestorsUpTo } from "./ancestorsUpTo";

describe("ancestorsUpTo", () => {
    it.each([
        {
            behaviour: "lists every directory from the start up to the root, nearest-first",
            startDir: "/work/a/b",
            root: "/work",
            ancestors: ["/work/a/b", "/work/a", "/work"],
        },
        {
            behaviour: "ends at a drive root as the host reported it",
            startDir: "/c:/proj",
            root: "/c:/",
            ancestors: ["/c:/proj", "/c:/"],
        },
        {
            behaviour: "treats a start at the drive root without its slash as the root",
            startDir: "/c:",
            root: "/c:/",
            ancestors: ["/c:/"],
        },
        {
            behaviour: "walks up to a workspace opened at the filesystem root",
            startDir: "/a/b",
            root: "/",
            ancestors: ["/a/b", "/a", "/"],
        },
        {
            behaviour: "returns only the root when the start is the root",
            startDir: "/work",
            root: "/work",
            ancestors: ["/work"],
        },
        {
            behaviour: "returns nothing for a start above the root",
            startDir: "/",
            root: "/work",
            ancestors: [],
        },
        {
            behaviour: "does not treat a sibling sharing the root's prefix as inside",
            startDir: "/workspace/x",
            root: "/work",
            ancestors: [],
        },
    ])("$behaviour", ({ startDir, root, ancestors }) => {
        expect(ancestorsUpTo(startDir, root)).toEqual(ancestors);
    });
});
