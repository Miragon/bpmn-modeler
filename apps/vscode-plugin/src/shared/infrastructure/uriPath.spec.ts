import { describe, expect, it, vi } from "vitest";

// `Uri.file` percent-encodes its argument; `Uri.parse` decodes an existing
// `file://` string. The stubs mirror just enough of that split for `toUri` to
// be observed picking the right constructor, and both take a UNC server as the
// authority, as VS Code does.
const fileMock = vi.fn((path: string) => {
    const unc = /^\/\/([^/]+)(\/.*)?$/.exec(path);
    return unc
        ? { scheme: "file", authority: unc[1], path: unc[2] ?? "/", via: "file" }
        : { scheme: "file", authority: "", path, via: "file" };
});
const parseMock = vi.fn((value: string) => {
    const [, authority, path] = /^file:\/\/([^/]*)(.*)$/.exec(value) ?? [];
    return { scheme: "file", authority, path: decodeURIComponent(path), via: "parse" };
});

vi.mock("vscode", () => ({
    Uri: {
        file: (path: string) => fileMock(path),
        parse: (value: string) => parseMock(value),
    },
}));

import { canonicalizeDriveLetter, canonicalPath, toUri } from "./uriPath";

describe("canonicalizeDriveLetter", () => {
    it("lowercases a leading Windows drive letter", () => {
        expect(canonicalizeDriveLetter("/C:/Users/proj")).toBe("/c:/Users/proj");
    });

    it("leaves an already-lowercase drive letter untouched", () => {
        expect(canonicalizeDriveLetter("/c:/Users/proj")).toBe("/c:/Users/proj");
    });

    it("leaves a POSIX path without a drive letter untouched", () => {
        expect(canonicalizeDriveLetter("/home/user/proj")).toBe("/home/user/proj");
    });

    it("only touches the drive letter, not later path segments", () => {
        expect(canonicalizeDriveLetter("/C:/A/B")).toBe("/c:/A/B");
    });
});

describe("toUri", () => {
    it("parses a `file://` string so `%3A` is decoded back to a drive path", () => {
        const uri = toUri("file:///c%3A/Users/proj");

        expect(parseMock).toHaveBeenCalledWith("file:///c%3A/Users/proj");
        expect(fileMock).not.toHaveBeenCalled();
        expect(uri.path).toBe("/c:/Users/proj");
    });

    it("treats a plain path as a filesystem path", () => {
        const uri = toUri("/c:/Users/proj");

        expect(fileMock).toHaveBeenCalledWith("/c:/Users/proj");
        expect(uri.path).toBe("/c:/Users/proj");
    });

    it.each([
        { spelling: "a UNC path", pathOrUri: "//server/share/dir/a.bpmn" },
        {
            spelling: "the file:// string of a UNC uri",
            pathOrUri: "file://server/share/dir/a.bpmn",
        },
    ])("turns $spelling back into a uri on that server", ({ pathOrUri }) => {
        expect(canonicalPath(toUri(pathOrUri))).toBe("//server/share/dir/a.bpmn");
    });
});

describe("canonicalPath", () => {
    it("canonicalizes the drive letter of a Uri's path", () => {
        expect(canonicalPath({ path: "/C:/ws" } as never)).toBe("/c:/ws");
    });

    it("keeps the server of a UNC uri", () => {
        const uri = { scheme: "file", authority: "server", path: "/share/dir/a.bpmn" };

        expect(canonicalPath(uri as never)).toBe("//server/share/dir/a.bpmn");
    });

    it("ignores the authority of a uri outside the file scheme", () => {
        const uri = { scheme: "vscode-vfs", authority: "github", path: "/owner/repo" };

        expect(canonicalPath(uri as never)).toBe("/owner/repo");
    });

    it("collapses an uppercase-drive folder and a lowercase-drive document to the same string", () => {
        // The exact drive-letter skew: `WorkspaceFolder.uri.path` keeps the
        // as-opened uppercase drive while the document URI is lowercased.
        const folder = canonicalPath({ path: "/C:/ws" } as never);
        const document = canonicalPath({ path: "/c:/ws/sub" } as never);

        expect(document.startsWith(folder + "/")).toBe(true);
    });
});
