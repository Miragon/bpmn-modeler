import { describe, expect, it } from "vitest";

import { InMemoryWorkspace } from "../../testing/InMemoryWorkspace";
import { RecordingNotifier } from "../../testing/RecordingNotifier";
import { README_UNREADABLE_TEXT } from "../domain/addOnTexts";
import { AddOnAboutReader } from "./AddOnAboutReader";

const PLUGIN = "/work/.camunda/plugins/acme";

function readerOver(files: Record<string, string>) {
    const notifier = new RecordingNotifier();
    return { reader: new AddOnAboutReader(new InMemoryWorkspace(["/work"], files), notifier), notifier };
}

describe("AddOnAboutReader", () => {
    it("reads a folder's README in any case and the license its package.json says", async () => {
        const { reader } = readerOver({
            [`${PLUGIN}/index.js`]: "",
            [`${PLUGIN}/Readme.md`]: "# Acme",
            [`${PLUGIN}/package.json`]: '{"license":"MIT"}',
        });

        expect(await reader.read({ kind: "folder", dir: PLUGIN })).toEqual({
            readme: { kind: "shown", markdown: "# Acme", truncated: false },
            license: { kind: "known", text: "MIT", label: "License: MIT, as its package.json says" },
        });
    });

    it("has nothing for a folder without either, one that is gone, or no place", async () => {
        const { reader } = readerOver({ [`${PLUGIN}/index.js`]: "" });

        expect(await reader.read({ kind: "folder", dir: PLUGIN })).toEqual({ readme: { kind: "none" } });
        expect(await reader.read({ kind: "folder", dir: "/work/gone" })).toEqual({
            readme: { kind: "none" },
        });
        expect(await reader.read(undefined)).toEqual({ readme: { kind: "none" } });
    });

    it("reads a marketplace's cached README beside the facts its cache held", async () => {
        const { reader } = readerOver({ "/cache/acme/readme/README.md": "Shared templates" });

        expect(
            await reader.read({
                kind: "marketplace",
                readmeFile: "/cache/acme/readme/README.md",
                repository: { host: "github", stars: 5 },
            }),
        ).toEqual({
            readme: { kind: "shown", markdown: "Shared templates", truncated: false },
            stars: { text: "5", label: "5 stars on GitHub, as of the last marketplace update" },
        });
        expect(
            await reader.read({ kind: "marketplace", readmeFile: "/cache/gone/readme/README.md" }),
        ).toEqual({ readme: { kind: "none" } });
    });

    it("logs and says so when the README cannot be read", async () => {
        const { reader, notifier } = readerOver({ [`${PLUGIN}/README.md/inner.txt`]: "" });

        expect(
            await reader.read({ kind: "marketplace", readmeFile: `${PLUGIN}/README.md` }),
        ).toEqual({ readme: { kind: "unreadable", text: README_UNREADABLE_TEXT } });
        expect(notifier.loggedErrors).toHaveLength(1);
    });
});
