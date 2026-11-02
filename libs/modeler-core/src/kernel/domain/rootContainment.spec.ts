import { describe, expect, it } from "vitest";

import {
    isWithinRoot,
    outermostPaths,
    relativeToRoot,
    relativeToWorkspace,
} from "./rootContainment";

describe("relativeToRoot", () => {
    it.each([
        {
            behaviour: "returns the path below the root",
            path: "/work/a/order.bpmn",
            root: "/work",
            relative: "a/order.bpmn",
        },
        {
            behaviour: "returns the empty path for the root itself",
            path: "/work",
            root: "/work",
            relative: "",
        },
        {
            behaviour: "ignores a trailing slash on the path",
            path: "/work/a/",
            root: "/work",
            relative: "a",
        },
        {
            behaviour: "ignores a trailing slash on the root",
            path: "/work/a",
            root: "/work/",
            relative: "a",
        },
        {
            behaviour: "contains every absolute path in the filesystem root",
            path: "/work/order.bpmn",
            root: "/",
            relative: "work/order.bpmn",
        },
        {
            behaviour: "contains the paths of a drive root",
            path: "C:/work/order.bpmn",
            root: "C:/",
            relative: "work/order.bpmn",
        },
        {
            behaviour: "contains the paths of a drive root spelled as a URI path",
            path: "/c:/work/order.bpmn",
            root: "/c:/",
            relative: "work/order.bpmn",
        },
        {
            behaviour: "treats a drive root without its slash as the root",
            path: "/c:",
            root: "/c:/",
            relative: "",
        },
        {
            behaviour: "contains the paths of a UNC share",
            path: "//server/share/repo/order.bpmn",
            root: "//server/share/repo",
            relative: "order.bpmn",
        },
        {
            behaviour: "keeps a file:// root and path in one spelling",
            path: "file:///work/a/order.bpmn",
            root: "file:///work",
            relative: "a/order.bpmn",
        },
        {
            behaviour: "does not contain a sibling that shares the root's name prefix",
            path: "/work2/order.bpmn",
            root: "/work",
            relative: undefined,
        },
        {
            behaviour: "does not contain a parent of the root",
            path: "/",
            root: "/work",
            relative: undefined,
        },
        {
            behaviour: "does not contain a path on another drive",
            path: "D:/work/order.bpmn",
            root: "C:/",
            relative: undefined,
        },
    ])("$behaviour", ({ path, root, relative }) => {
        expect(relativeToRoot(path, root)).toBe(relative);
    });
});

describe("isWithinRoot", () => {
    it.each([
        { path: "/work/order.bpmn", root: "/work", within: true },
        { path: "/work", root: "/work", within: true },
        { path: "/work/order.bpmn", root: "/", within: true },
        { path: "C:/work/order.bpmn", root: "C:/", within: true },
        { path: "/work2/order.bpmn", root: "/work", within: false },
        { path: "/", root: "/work", within: false },
    ])("answers $within for $path in $root", ({ path, root, within }) => {
        expect(isWithinRoot(path, root)).toBe(within);
    });
});

describe("relativeToWorkspace", () => {
    it.each<{ behaviour: string; path: string; folders: string[]; relative: string }>([
        {
            behaviour: "is the path below the only folder",
            path: "/work/src/order.bpmn",
            folders: ["/work"],
            relative: "src/order.bpmn",
        },
        {
            behaviour: "leads with the folder's name when several folders are open",
            path: "/repos/app/src/order.bpmn",
            folders: ["/libs/shared", "/repos/app"],
            relative: "app/src/order.bpmn",
        },
        {
            behaviour: "takes the innermost folder holding the path, listed first",
            path: "/work/nested/order.bpmn",
            folders: ["/work/nested", "/work"],
            relative: "nested/order.bpmn",
        },
        {
            behaviour: "takes the innermost folder holding the path, listed last",
            path: "/work/nested/order.bpmn",
            folders: ["/work", "/work/nested"],
            relative: "nested/order.bpmn",
        },
        {
            behaviour: "does not take a folder that only shares the path's name prefix",
            path: "/work2/order.bpmn",
            folders: ["/work", "/work2"],
            relative: "work2/order.bpmn",
        },
        {
            behaviour: "keeps a path outside every folder",
            path: "/elsewhere/order.bpmn",
            folders: ["/work"],
            relative: "/elsewhere/order.bpmn",
        },
        {
            behaviour: "keeps the path when no folder is open",
            path: "/work/order.bpmn",
            folders: [],
            relative: "/work/order.bpmn",
        },
    ])("$behaviour", ({ path, folders, relative }) => {
        expect(relativeToWorkspace(path, folders)).toBe(relative);
    });
});

describe("outermostPaths", () => {
    it.each([
        {
            behaviour: "keeps paths that hold none of the others",
            paths: ["/work/a", "/work/b"],
            outermost: ["/work/a", "/work/b"],
        },
        {
            behaviour: "drops a path below another, in either order",
            paths: ["/work/a/b/c", "/work/a", "/work/a/b"],
            outermost: ["/work/a"],
        },
        {
            behaviour: "keeps a path that only shares a prefix",
            paths: ["/work/a", "/work/ab"],
            outermost: ["/work/a", "/work/ab"],
        },
        {
            behaviour: "keeps a repeated path once",
            paths: ["/work/a", "/work/a"],
            outermost: ["/work/a"],
        },
        { behaviour: "returns nothing for no paths", paths: [], outermost: [] },
    ])("$behaviour", ({ paths, outermost }) => {
        expect(outermostPaths(paths)).toEqual(outermost);
    });
});
