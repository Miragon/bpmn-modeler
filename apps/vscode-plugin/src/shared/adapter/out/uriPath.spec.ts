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

import { canonicalPath } from "../../domain/canonicalPath";
import { toUri } from "./uriPath";

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
