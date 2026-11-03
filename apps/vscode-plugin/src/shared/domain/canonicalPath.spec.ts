import { describe, expect, it } from "vitest";

import { canonicalizeDriveLetter, canonicalPath } from "./canonicalPath";

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
