import { win32 } from "path";
import { describe, expect, it } from "vitest";

import {
    joinWorkspacePath,
    parentWorkspacePath,
    toWorkspacePath,
    withoutFileScheme,
} from "./workspacePath";

describe("toWorkspacePath", () => {
    it.each([
        {
            behaviour: "keeps a POSIX path unchanged",
            path: "/repo/src/A.java",
            spelled: "/repo/src/A.java",
        },
        {
            behaviour: "turns a drive-letter path's backslashes into slashes",
            path: "C:\\repo\\src\\A.java",
            spelled: "C:/repo/src/A.java",
        },
        {
            behaviour: "keeps the leading // of a backslashed UNC path",
            path: "\\\\server\\share\\repo\\src\\A.java",
            spelled: "//server/share/repo/src/A.java",
        },
        {
            behaviour: "keeps the leading // of a forward-slash UNC path",
            path: "//server/share/repo/src/A.java",
            spelled: "//server/share/repo/src/A.java",
        },
        {
            behaviour: "keeps a UNC root whose separators are mixed",
            path: "\\/server\\share/repo\\src/A.java",
            spelled: "//server/share/repo/src/A.java",
        },
        {
            behaviour: "spells a drive-letter path with mixed separators with slashes",
            path: "C:/repo\\src/A.java",
            spelled: "C:/repo/src/A.java",
        },
        {
            behaviour: "collapses repeated separators below the UNC root",
            path: "//server//share\\\\repo/./src/A.java",
            spelled: "//server/share/repo/src/A.java",
        },
        {
            behaviour: "treats three leading slashes as one, not as a UNC root",
            path: "///repo/src/A.java",
            spelled: "/repo/src/A.java",
        },
        {
            behaviour: "keeps the file:// scheme of a URI-form path",
            path: "file:///c:/repo/src/A.java",
            spelled: "file:///c:/repo/src/A.java",
        },
        {
            behaviour: "keeps the UNC root behind a file:// scheme",
            path: "file:////server/share/repo/src/A.java",
            spelled: "file:////server/share/repo/src/A.java",
        },
    ])("$behaviour", ({ path, spelled }) => {
        expect(toWorkspacePath(path)).toBe(spelled);
    });

    // Node's fs opens `toNamespacedPath(path)` on Windows; `/server/share/…`
    // would name a folder on the current drive.
    it.each([
        {
            path: "\\\\server\\share\\repo\\src\\A.java",
            opened: "\\\\?\\UNC\\server\\share\\repo\\src\\A.java",
        },
        {
            path: "//server/share/repo/src/A.java",
            opened: "\\\\?\\UNC\\server\\share\\repo\\src\\A.java",
        },
        {
            path: "C:\\repo\\src\\A.java",
            opened: "\\\\?\\C:\\repo\\src\\A.java",
        },
    ])("spells $path so Node's fs on Windows opens $opened", ({ path, opened }) => {
        expect(win32.toNamespacedPath(toWorkspacePath(path))).toBe(opened);
    });
});

describe("joinWorkspacePath", () => {
    it.each([
        {
            behaviour: "joins segments onto a POSIX directory",
            directory: "/repo",
            segments: [".camunda", "element-templates"],
            joined: "/repo/.camunda/element-templates",
        },
        {
            behaviour: "joins segments onto a drive-letter directory",
            directory: "C:/repo",
            segments: [".camunda", ".bpmnlintrc"],
            joined: "C:/repo/.camunda/.bpmnlintrc",
        },
        {
            behaviour: "keeps the leading // of a UNC directory",
            directory: "//server/share/repo",
            segments: ["src/A.java"],
            joined: "//server/share/repo/src/A.java",
        },
        {
            behaviour: "joins onto a directory with a trailing slash without doubling it",
            directory: "/c:/",
            segments: [".git"],
            joined: "/c:/.git",
        },
        {
            behaviour: "joins onto the filesystem root without opening a UNC root",
            directory: "/",
            segments: [".git"],
            joined: "/.git",
        },
        {
            behaviour: "joins an empty segment onto the filesystem root without opening a UNC root",
            directory: "/",
            segments: ["", "proj"],
            joined: "/proj",
        },
        {
            behaviour: "joins onto the root of a URI-form path",
            directory: "file:///",
            segments: [".git"],
            joined: "file:///.git",
        },
        {
            behaviour: "turns backslashes in the segments into slashes",
            directory: "//server/share/repo",
            segments: ["src\\A.java"],
            joined: "//server/share/repo/src/A.java",
        },
        {
            behaviour: "resolves a config folder that climbs out of the directory",
            directory: "//server/share/repo/app",
            segments: ["../shared", "deployment-targets.json"],
            joined: "//server/share/repo/shared/deployment-targets.json",
        },
        {
            behaviour: "skips an empty segment",
            directory: "/repo",
            segments: ["", "element-templates"],
            joined: "/repo/element-templates",
        },
        {
            behaviour: "skips a trailing empty segment instead of adding a trailing slash",
            directory: "/repo",
            segments: [""],
            joined: "/repo",
        },
        {
            behaviour: "keeps a relative path relative when the directory is empty",
            directory: "",
            segments: ["src/A.java"],
            joined: "src/A.java",
        },
        {
            behaviour: "keeps the file:/// of a URI-form directory",
            directory: "file:///c:/repo",
            segments: [".git"],
            joined: "file:///c:/repo/.git",
        },
    ])("$behaviour", ({ directory, segments, joined }) => {
        expect(joinWorkspacePath(directory, ...segments)).toBe(joined);
    });
});

describe("parentWorkspacePath", () => {
    it.each([
        {
            behaviour: "returns the directory holding a POSIX path",
            path: "/repo/src",
            parent: "/repo",
        },
        {
            behaviour: "climbs from a top-level folder to the filesystem root",
            path: "/repo",
            parent: "/",
        },
        {
            behaviour: "has no parent above the filesystem root",
            path: "/",
            parent: undefined,
        },
        {
            behaviour: "climbs to the share root of a UNC path",
            path: "//server/share/repo",
            parent: "//server/share",
        },
        {
            behaviour: "has no parent above a UNC share root",
            path: "//server/share",
            parent: undefined,
        },
        {
            behaviour: "has no parent above a UNC share root with a trailing slash",
            path: "//server/share/",
            parent: undefined,
        },
        {
            behaviour: "keeps the scheme of a URI-form path",
            path: "file:///repo/src",
            parent: "file:///repo",
        },
        {
            behaviour: "climbs to the share root of a UNC path behind a file:// scheme",
            path: "file:////server/share/repo",
            parent: "file:////server/share",
        },
        {
            behaviour: "has no parent above a UNC share root behind a file:// scheme",
            path: "file:////server/share",
            parent: undefined,
        },
        {
            behaviour: "climbs to the share root of a UNC uri naming its server as authority",
            path: "file://server/share/repo",
            parent: "file://server/share",
        },
        {
            behaviour: "has no parent above the share root of a UNC uri naming its server",
            path: "file://server/share",
            parent: undefined,
        },
        {
            behaviour: "has no parent above the share root of a UNC uri with a trailing slash",
            path: "file://server/share/",
            parent: undefined,
        },
        {
            behaviour: "climbs from a top-level folder to the root of a file:// uri",
            path: "file:///repo",
            parent: "file:///",
        },
        {
            behaviour: "has no parent above the root of a file:// uri",
            path: "file:///",
            parent: undefined,
        },
    ])("$behaviour", ({ path, parent }) => {
        expect(parentWorkspacePath(path)).toBe(parent);
    });
});

describe("withoutFileScheme", () => {
    it.each([
        {
            behaviour: "strips the scheme of a URI-form path",
            path: "file:///work/order.bpmn",
            stripped: "/work/order.bpmn",
        },
        {
            behaviour: "keeps the drive of an IntelliJ file URL",
            path: "file://C:/work/order.bpmn",
            stripped: "C:/work/order.bpmn",
        },
        {
            behaviour: "keeps the UNC root behind the scheme",
            path: "file:////server/share/order.bpmn",
            stripped: "//server/share/order.bpmn",
        },
        {
            behaviour: "keeps a path without a scheme unchanged",
            path: "/work/order.bpmn",
            stripped: "/work/order.bpmn",
        },
        {
            behaviour: "strips only a leading scheme",
            path: "/work/file:///order.bpmn",
            stripped: "/work/file:///order.bpmn",
        },
    ])("$behaviour", ({ path, stripped }) => {
        expect(withoutFileScheme(path)).toBe(stripped);
    });
});
