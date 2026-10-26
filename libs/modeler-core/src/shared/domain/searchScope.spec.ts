import { describe, expect, it } from "vitest";

import { type SearchScope, searchScopeKey, searchScopeRoots } from "./searchScope";

const folders = (...paths: string[]): SearchScope => ({
    kind: "workspace-folders",
    folders: paths,
});
const looseFile = (directory: string): SearchScope => ({ kind: "loose-file", directory });

describe("searchScope", () => {
    it.each([
        { scope: folders("/work", "/shared"), roots: ["/work", "/shared"] },
        { scope: looseFile("/downloads"), roots: ["/downloads"] },
    ])("roots $scope.kind at $roots", ({ scope, roots }) => {
        expect(searchScopeRoots(scope)).toEqual(roots);
    });

    it.each([
        {
            behaviour: "the same folders",
            first: folders("/a", "/b"),
            second: folders("/a", "/b"),
            same: true,
        },
        {
            behaviour: "the same loose directory",
            first: looseFile("/a"),
            second: looseFile("/a"),
            same: true,
        },
        {
            behaviour: "an added folder",
            first: folders("/a"),
            second: folders("/a", "/b"),
            same: false,
        },
        {
            behaviour: "folders that read alike unseparated",
            first: folders("/a", "/b"),
            second: folders("/a/b"),
            same: false,
        },
        {
            behaviour: "another loose directory",
            first: looseFile("/a"),
            second: looseFile("/b"),
            same: false,
        },
        {
            behaviour: "a loose directory that was a folder",
            first: looseFile("/a"),
            second: folders("/a"),
            same: false,
        },
    ])("keys $behaviour as the same scope: $same", ({ first, second, same }) => {
        expect(searchScopeKey(first) === searchScopeKey(second)).toBe(same);
    });
});
