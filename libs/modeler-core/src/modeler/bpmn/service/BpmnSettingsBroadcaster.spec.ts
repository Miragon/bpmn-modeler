import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnSettingsBroadcaster` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { BpmnModelerSettingQuery, LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnSettingsBroadcaster } from "./BpmnSettingsBroadcaster";

const EDITOR = "file:///work/diagram.bpmn";

function createBroadcaster() {
    const editorStore = {
        postMessage: vi.fn().mockResolvedValue(true),
        subscribeToSettingChangeEvent: vi.fn(),
    };
    const vsSettings = {
        getAlignToOrigin: vi.fn().mockReturnValue(true),
        getShowTransactionBoundaries: vi.fn().mockReturnValue(false),
        getColorTheme: vi.fn().mockReturnValue("light"),
        getFavouriteBpmnElements: vi.fn().mockReturnValue(["bpmn:Task"]),
        getResizableActivities: vi.fn().mockReturnValue(true),
        getLanguage: vi.fn().mockReturnValue("de"),
    };
    const notifier = { notifyError: vi.fn(), logError: vi.fn() };

    const broadcaster = new BpmnSettingsBroadcaster(
        editorStore as never,
        vsSettings as never,
        notifier as never,
    );

    return { broadcaster, editorStore, vsSettings, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnSettingsBroadcaster.setSettings", () => {
    it("builds the setting from VS Code config and posts it", async () => {
        const { broadcaster, editorStore } = createBroadcaster();

        const result = await broadcaster.setSettings(EDITOR);

        expect(result).toBe(true);
        const [id, msg] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(msg).toBeInstanceOf(BpmnModelerSettingQuery);
        expect((msg as BpmnModelerSettingQuery).setting).toEqual({
            alignToOrigin: true,
            showTransactionBoundaries: false,
            colorTheme: "light",
            favouriteBpmnElements: ["bpmn:Task"],
            resizableActivities: true,
        });
    });

    it("notifies and returns false when the webview rejects the post", async () => {
        const { broadcaster, editorStore, notifier } = createBroadcaster();
        editorStore.postMessage.mockResolvedValue(false);

        const result = await broadcaster.setSettings(EDITOR);

        expect(result).toBe(false);
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });

    it("logs and returns false when reading a setting throws", async () => {
        const { broadcaster, vsSettings, notifier } = createBroadcaster();
        vsSettings.getAlignToOrigin.mockImplementation(() => {
            throw new Error("config read failed");
        });

        const result = await broadcaster.setSettings(EDITOR);

        expect(result).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(notifier.notifyError).not.toHaveBeenCalled();
    });
});

describe("BpmnSettingsBroadcaster.setLanguage", () => {
    it("posts the configured locale as a LanguageQuery", () => {
        const { broadcaster, editorStore, vsSettings } = createBroadcaster();
        vsSettings.getLanguage.mockReturnValue("fr");

        broadcaster.setLanguage(EDITOR);

        const [id, msg] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(msg).toBeInstanceOf(LanguageQuery);
        expect((msg as LanguageQuery).locale).toBe("fr");
    });

    it("logs when the language post is rejected", async () => {
        const { broadcaster, editorStore, notifier } = createBroadcaster();
        editorStore.postMessage.mockRejectedValue(new Error("hidden editor"));

        broadcaster.setLanguage(EDITOR);
        // The `.catch` handler runs on a later microtask; flush before asserting.
        await Promise.resolve();
        await Promise.resolve();

        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});

describe("BpmnSettingsBroadcaster.subscribe", () => {
    /**
     * Drives the registered config-change callback with a stub event whose
     * `affectsConfiguration` only matches the given keys, so each fan-out
     * branch can be exercised in isolation.
     */
    function fireSettingChange(
        editorStore: { subscribeToSettingChangeEvent: ReturnType<typeof vi.fn> },
        affected: string[],
    ) {
        const callback = editorStore.subscribeToSettingChangeEvent.mock.calls[0][1];
        callback({ affectsConfiguration: (key: string) => affected.includes(key) }, EDITOR);
    }

    it("re-pushes settings when a modeler setting changes", () => {
        const { broadcaster, editorStore } = createBroadcaster();
        const setSettings = vi.spyOn(broadcaster, "setSettings").mockResolvedValue(true);
        const setLanguage = vi.spyOn(broadcaster, "setLanguage").mockReturnValue(undefined);

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.colorTheme"]);

        expect(setSettings).toHaveBeenCalledWith(EDITOR);
        expect(setLanguage).not.toHaveBeenCalled();
    });

    it("re-pushes the language when the language setting changes", () => {
        const { broadcaster, editorStore } = createBroadcaster();
        const setSettings = vi.spyOn(broadcaster, "setSettings").mockResolvedValue(true);
        const setLanguage = vi.spyOn(broadcaster, "setLanguage").mockReturnValue(undefined);

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.language"]);

        expect(setLanguage).toHaveBeenCalledWith(EDITOR);
        expect(setSettings).not.toHaveBeenCalled();
    });

    it("ignores config changes outside the modeler namespace", () => {
        const { broadcaster, editorStore } = createBroadcaster();
        const setSettings = vi.spyOn(broadcaster, "setSettings").mockResolvedValue(true);
        const setLanguage = vi.spyOn(broadcaster, "setLanguage").mockReturnValue(undefined);

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["editor.fontSize"]);

        expect(setSettings).not.toHaveBeenCalled();
        expect(setLanguage).not.toHaveBeenCalled();
    });

    it("guards a rejecting setSettings so the change listener never leaks a rejection", async () => {
        const { broadcaster, editorStore, notifier } = createBroadcaster();
        vi.spyOn(broadcaster, "setSettings").mockRejectedValue(new Error("post failed"));

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.colorTheme"]);
        // The `.catch` guard runs on a later microtask; flush before asserting.
        await Promise.resolve();
        await Promise.resolve();

        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});
