import { describe, expect, it } from "vitest";

import { InMemoryWorkspace } from "../../testing/InMemoryWorkspace";
import { RecordingNotifier } from "../../testing/RecordingNotifier";
import { README_UNREADABLE_TEXT } from "../domain/addOnTexts";
import { AddOnReadmeReader } from "./AddOnReadmeReader";

const PLUGIN = "/work/.camunda/plugins/acme";

function readerOver(files: Record<string, string>) {
    const notifier = new RecordingNotifier();
    return { reader: new AddOnReadmeReader(new InMemoryWorkspace(["/work"], files), notifier), notifier };
}

describe("AddOnReadmeReader", () => {
    it("reads the README a plugin folder holds, in any case", async () => {
        const { reader } = readerOver({
            [`${PLUGIN}/index.js`]: "",
            [`${PLUGIN}/Readme.md`]: "# Acme",
        });

        expect(await reader.read({ kind: "folder", dir: PLUGIN })).toEqual({
            kind: "shown",
            markdown: "# Acme",
            truncated: false,
        });
    });

    it("has none for a folder without one, one that is gone, or no place", async () => {
        const { reader } = readerOver({ [`${PLUGIN}/index.js`]: "" });

        expect(await reader.read({ kind: "folder", dir: PLUGIN })).toEqual({ kind: "none" });
        expect(await reader.read({ kind: "folder", dir: "/work/gone" })).toEqual({ kind: "none" });
        expect(await reader.read(undefined)).toEqual({ kind: "none" });
    });

    it("reads a cached file, and has none once it is gone", async () => {
        const { reader } = readerOver({ "/cache/acme/README.md": "Shared templates" });

        expect(await reader.read({ kind: "file", path: "/cache/acme/README.md" })).toMatchObject({
            markdown: "Shared templates",
        });
        expect(await reader.read({ kind: "file", path: "/cache/other/README.md" })).toEqual({
            kind: "none",
        });
    });

    it("logs and says so when the file cannot be read", async () => {
        const { reader, notifier } = readerOver({ [`${PLUGIN}/README.md/inner.txt`]: "" });

        expect(await reader.read({ kind: "file", path: `${PLUGIN}/README.md` })).toEqual({
            kind: "unreadable",
            text: README_UNREADABLE_TEXT,
        });
        expect(notifier.loggedErrors).toHaveLength(1);
    });
});
