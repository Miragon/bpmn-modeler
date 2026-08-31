import { describe, expect, it, vi } from "vitest";

// `Uri.file` percent-encodes its argument; `Uri.parse` decodes an existing
// `file://` string. The stubs mirror just enough of that split for `toUri` to
// be observed picking the right constructor.
const fileMock = vi.fn((path: string) => ({ scheme: "file", path, via: "file" }));
const parseMock = vi.fn((value: string) => ({
    scheme: "file",
    path: decodeURIComponent(value.replace(/^file:\/\//, "")),
    via: "parse",
}));

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
});

describe("canonicalPath", () => {
    it("canonicalizes the drive letter of a Uri's path", () => {
        expect(canonicalPath({ path: "/C:/ws" } as never)).toBe("/c:/ws");
    });

    it("collapses an uppercase-drive folder and a lowercase-drive document to the same string", () => {
        // The exact drive-letter skew: `WorkspaceFolder.uri.path` keeps the
        // as-opened uppercase drive while the document URI is lowercased.
        const folder = canonicalPath({ path: "/C:/ws" } as never);
        const document = canonicalPath({ path: "/c:/ws/sub" } as never);

        expect(document.startsWith(folder + "/")).toBe(true);
    });
});
