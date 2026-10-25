import { describe, expect, it, vi } from "vitest";

import { DmnModelerSettingQuery, LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { DmnSettingsBroadcaster } from "./DmnSettingsBroadcaster";

function createBroadcaster() {
    const host = createTestHost({ settings: { colorTheme: "light", language: "de" } });
    const editor = host.openEditor("/work/decision.dmn");
    const broadcaster = new DmnSettingsBroadcaster(host.store, host.settings, host.notifier);
    return { broadcaster, host, editor };
}

describe("DmnSettingsBroadcaster.setSettings", () => {
    it("reads the color theme from VS Code config and posts it", async () => {
        const { broadcaster, editor } = createBroadcaster();

        const result = await broadcaster.setSettings(editor.id);

        expect(result).toBe(true);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(DmnModelerSettingQuery);
        expect((msg as DmnModelerSettingQuery).setting).toEqual({ colorTheme: "light" });
    });

    it("notifies and returns false when the webview rejects the post", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        vi.spyOn(editor, "postMessage").mockResolvedValue(false);

        const result = await broadcaster.setSettings(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while applying modeler settings.\nUnable to set preferences.",
        ]);
    });

    it("logs and returns false when reading the setting throws", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        vi.spyOn(host.settings, "getColorTheme").mockImplementation(() => {
            throw new Error("config read failed");
        });

        const result = await broadcaster.setSettings(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.logged("error")).toEqual(["config read failed"]);
        expect(host.notifier.errors).toEqual([]);
    });
});

describe("DmnSettingsBroadcaster.setLanguage", () => {
    it("posts the configured language as a LanguageQuery", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.setLanguage(editor.id);

        expect(editor.posted).toHaveLength(1);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(LanguageQuery);
        expect((msg as LanguageQuery).locale).toBe("de");
    });

    it("logs when the post rejects", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        editor.hidden = true;

        broadcaster.setLanguage(editor.id);
        await Promise.resolve();
        await Promise.resolve();

        expect(host.notifier.logged("error")).toEqual(["The active editor is hidden."]);
    });
});

describe("DmnSettingsBroadcaster.subscribe", () => {
    it("re-pushes the theme, not the language, when the colorTheme setting changes", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.colorTheme");

        expect(editor.postedOfType("DmnModelerSettingQuery")).toHaveLength(1);
        expect(editor.postedOfType("LanguageQuery")).toHaveLength(0);
    });

    it("re-pushes the language, not the settings, when the language setting changes", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.language");

        expect(editor.postedOfType("LanguageQuery")).toHaveLength(1);
        expect(editor.postedOfType("DmnModelerSettingQuery")).toHaveLength(0);
    });

    it("ignores config changes outside the theme and language settings", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.alignToOrigin", "editor.fontSize");

        expect(editor.posted).toEqual([]);
    });

    it("guards a rejecting setSettings so the change listener never leaks a rejection", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        vi.spyOn(broadcaster, "setSettings").mockRejectedValue(new Error("post failed"));

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.colorTheme");
        await Promise.resolve();
        await Promise.resolve();

        expect(host.notifier.logged("error")).toEqual(["post failed"]);
    });
});
