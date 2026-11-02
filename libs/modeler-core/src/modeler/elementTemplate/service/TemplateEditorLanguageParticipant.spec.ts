import { describe, expect, it } from "vitest";

import { LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { TemplateEditorLanguageParticipant } from "./TemplateEditorLanguageParticipant";

async function openPreview() {
    const host = createTestHost();
    const editor = await host.openSession("/work/element-templates/status.json", [
        new TemplateEditorLanguageParticipant(host.store, host.settings, host.notifier),
    ]);
    return { host, editor };
}

describe("TemplateEditorLanguageParticipant", () => {
    it("sends the new language when it changes", async () => {
        const { host, editor } = await openPreview();

        host.settings.values.language = "de";
        editor.changeSetting("language");

        expect(editor.postedOfType<LanguageQuery>("LanguageQuery")).toEqual([
            new LanguageQuery("de"),
        ]);
    });

    it("ignores other settings", async () => {
        const { editor } = await openPreview();

        editor.changeSetting("colorTheme");

        expect(editor.postedOfType<LanguageQuery>("LanguageQuery")).toEqual([]);
    });

    it("passes a hidden editor by quietly: its page asks for the file again when shown", async () => {
        const { host, editor } = await openPreview();
        editor.hidden = true;

        editor.changeSetting("language");
        await Promise.resolve();

        expect(host.notifier.loggedErrors).toEqual([]);
    });
});
