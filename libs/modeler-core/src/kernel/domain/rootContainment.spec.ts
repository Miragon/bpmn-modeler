import { describe, expect, it } from "vitest";

import {
    innermostFolderOf,
    isWithinRoot,
    outermostPaths,
    relativeToRoot,
    relativeToWorkspace,
    staysInsideFolder,
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

describe("innermostFolderOf", () => {
    const folders = ["/work", "/work/orders", "/other"];

    it.each([
        { path: "/work/.camunda/plugins/a", folder: "/work" },
        { path: "/work/orders/.camunda/plugins/a", folder: "/work/orders" },
        { path: "/other/node_modules/bpmnlint-plugin-a", folder: "/other" },
        { path: "/work", folder: "/work" },
        { path: "/elsewhere/node_modules/x", folder: undefined },
        { path: "/work2/x", folder: undefined },
    ])("puts $path in $folder", ({ path, folder }) => {
        expect(innermostFolderOf(path, folders)).toBe(folder);
    });

    it("finds the innermost folder whatever order the folders were opened in", () => {
        expect(innermostFolderOf("/work/orders/x", ["/work/orders", "/work"])).toBe("/work/orders");
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

describe("staysInsideFolder", () => {
    it.each<{ behaviour: string; relativePath: string; inside: boolean }>([
        { behaviour: "keeps a nested relative path", relativePath: "dist/client.js", inside: true },
        { behaviour: "keeps a bare file name", relativePath: "client.js", inside: true },
        { behaviour: "keeps dots inside a segment", relativePath: "a..b/..hidden/c", inside: true },
        { behaviour: "keeps the folder itself", relativePath: "", inside: true },
        {
            behaviour: "keeps a leading current-folder segment",
            relativePath: "./c.js",
            inside: true,
        },
        { behaviour: "refuses a lone parent segment", relativePath: "..", inside: false },
        { behaviour: "refuses a leading parent segment", relativePath: "../c.js", inside: false },
        {
            behaviour: "refuses a parent segment mid-path",
            relativePath: "a/../../c",
            inside: false,
        },
        {
            behaviour: "refuses a backslash parent segment",
            relativePath: "a\\..\\c",
            inside: false,
        },
        { behaviour: "refuses an absolute posix path", relativePath: "/etc/c", inside: false },
        {
            behaviour: "refuses a path rooted by a backslash",
            relativePath: "\\Windows\\c",
            inside: false,
        },
        { behaviour: "refuses a UNC path", relativePath: "\\\\server\\share\\c", inside: false },
        { behaviour: "refuses a drive path with a slash", relativePath: "c:/c.js", inside: false },
        {
            behaviour: "refuses a drive path with a backslash",
            relativePath: "C:\\c.js",
            inside: false,
        },
        { behaviour: "refuses a drive-relative path", relativePath: "C:c.js", inside: false },
    ])("$behaviour", ({ relativePath, inside }) => {
        expect(staysInsideFolder(relativePath)).toBe(inside);
    });
});
