import { describe, expect, it, vi } from "vitest";

import { BpmnModelerSettingQuery, LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { BpmnSettingsBroadcaster } from "./BpmnSettingsBroadcaster";

function createBroadcaster() {
    const host = createTestHost({
        settings: {
            alignToOrigin: true,
            showTransactionBoundaries: false,
            colorTheme: "light",
            favouriteBpmnElements: ["bpmn:Task"],
            language: "de",
        },
    });
    const editor = host.openEditor("/work/diagram.bpmn");
    const broadcaster = new BpmnSettingsBroadcaster(host.store, host.settings, host.notifier);
    return { broadcaster, host, editor };
}

describe("BpmnSettingsBroadcaster.setSettings", () => {
    it("builds the setting from VS Code config and posts it", async () => {
        const { broadcaster, editor } = createBroadcaster();

        const result = await broadcaster.setSettings(editor.id);

        expect(result).toBe(true);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(BpmnModelerSettingQuery);
        expect((msg as BpmnModelerSettingQuery).setting).toEqual({
            alignToOrigin: true,
            showTransactionBoundaries: false,
            colorTheme: "light",
            favouriteBpmnElements: ["bpmn:Task"],
        });
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

    it("logs and returns false when reading a setting throws", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        vi.spyOn(host.settings, "getAlignToOrigin").mockImplementation(() => {
            throw new Error("config read failed");
        });

        const result = await broadcaster.setSettings(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.logged("error")).toEqual(["config read failed"]);
        expect(host.notifier.errors).toEqual([]);
    });
});

describe("BpmnSettingsBroadcaster.setLanguage", () => {
    it("posts the configured locale as a LanguageQuery", () => {
        const { broadcaster, host, editor } = createBroadcaster();
        host.settings.values.language = "fr";

        broadcaster.setLanguage(editor.id);

        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(LanguageQuery);
        expect((msg as LanguageQuery).locale).toBe("fr");
    });

    it("logs when the language post is rejected", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        editor.hidden = true;

        broadcaster.setLanguage(editor.id);
        // The `.catch` handler runs on a later microtask; flush before asserting.
        await Promise.resolve();
        await Promise.resolve();

        expect(host.notifier.logged("error")).toEqual(["The active editor is hidden."]);
    });
});

describe("BpmnSettingsBroadcaster.subscribe", () => {
    it("re-pushes settings when a modeler setting changes", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.colorTheme");

        expect(editor.postedOfType("BpmnModelerSettingQuery")).toHaveLength(1);
        expect(editor.postedOfType("LanguageQuery")).toHaveLength(0);
    });

    it("re-pushes the language when the language setting changes", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.language");

        expect(editor.postedOfType("LanguageQuery")).toHaveLength(1);
        expect(editor.postedOfType("BpmnModelerSettingQuery")).toHaveLength(0);
    });

    it("ignores config changes outside the modeler namespace", () => {
        const { broadcaster, editor } = createBroadcaster();

        broadcaster.subscribe(editor.id);
        editor.changeSetting("editor.fontSize");

        expect(editor.posted).toEqual([]);
    });

    it("guards a rejecting setSettings so the change listener never leaks a rejection", async () => {
        const { broadcaster, host, editor } = createBroadcaster();
        vi.spyOn(broadcaster, "setSettings").mockRejectedValue(new Error("post failed"));

        broadcaster.subscribe(editor.id);
        editor.changeSetting("miragon.bpmnModeler.colorTheme");
        // The `.catch` guard runs on a later microtask; flush before asserting.
        await Promise.resolve();
        await Promise.resolve();

        expect(host.notifier.logged("error")).toEqual(["post failed"]);
    });
});
