import { beforeEach, describe, expect, it, vi } from "vitest";

// `DmnSettingsBroadcaster` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { DmnModelerSettingQuery, LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { DmnSettingsBroadcaster } from "./DmnSettingsBroadcaster";

const EDITOR = "file:///work/decision.dmn";

function createBroadcaster() {
    const editorStore = {
        postMessage: vi.fn().mockResolvedValue(true),
        subscribeToSettingChangeEvent: vi.fn(),
    };
    const vsSettings = {
        getColorTheme: vi.fn().mockReturnValue("light"),
        getLanguage: vi.fn().mockReturnValue("de"),
    };
    const notifier = { notifyError: vi.fn(), logError: vi.fn() };

    const broadcaster = new DmnSettingsBroadcaster(
        editorStore as never,
        vsSettings as never,
        notifier as never,
    );

    return { broadcaster, editorStore, vsSettings, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DmnSettingsBroadcaster.setSettings", () => {
    it("reads the color theme from VS Code config and posts it", async () => {
        const { broadcaster, editorStore } = createBroadcaster();

        const result = await broadcaster.setSettings(EDITOR);

        expect(result).toBe(true);
        const [id, msg] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(msg).toBeInstanceOf(DmnModelerSettingQuery);
        expect((msg as DmnModelerSettingQuery).setting).toEqual({ colorTheme: "light" });
    });

    it("notifies and returns false when the webview rejects the post", async () => {
        const { broadcaster, editorStore, notifier } = createBroadcaster();
        editorStore.postMessage.mockResolvedValue(false);

        const result = await broadcaster.setSettings(EDITOR);

        expect(result).toBe(false);
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });

    it("logs and returns false when reading the setting throws", async () => {
        const { broadcaster, vsSettings, notifier } = createBroadcaster();
        vsSettings.getColorTheme.mockImplementation(() => {
            throw new Error("config read failed");
        });

        const result = await broadcaster.setSettings(EDITOR);

        expect(result).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(notifier.notifyError).not.toHaveBeenCalled();
    });
});

describe("DmnSettingsBroadcaster.setLanguage", () => {
    it("posts the configured language as a LanguageQuery", () => {
        const { broadcaster, editorStore, vsSettings } = createBroadcaster();

        broadcaster.setLanguage(EDITOR);

        expect(vsSettings.getLanguage).toHaveBeenCalledOnce();
        const [id, msg] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(msg).toBeInstanceOf(LanguageQuery);
        expect((msg as LanguageQuery).locale).toBe("de");
    });

    it("logs when the post rejects", async () => {
        const { broadcaster, editorStore, notifier } = createBroadcaster();
        editorStore.postMessage.mockRejectedValue(new Error("post failed"));

        broadcaster.setLanguage(EDITOR);
        await Promise.resolve();
        await Promise.resolve();

        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});

describe("DmnSettingsBroadcaster.subscribe", () => {
    /**
     * Drives the registered config-change callback with a stub event whose
     * `affectsConfiguration` only matches the given keys.
     */
    function fireSettingChange(
        editorStore: { subscribeToSettingChangeEvent: ReturnType<typeof vi.fn> },
        affected: string[],
    ) {
        const callback = editorStore.subscribeToSettingChangeEvent.mock.calls[0][1];
        callback({ affectsConfiguration: (key: string) => affected.includes(key) }, EDITOR);
    }

    it("re-pushes the theme, not the language, when the colorTheme setting changes", () => {
        const { broadcaster, editorStore } = createBroadcaster();
        const setSettings = vi.spyOn(broadcaster, "setSettings").mockResolvedValue(true);
        const setLanguage = vi.spyOn(broadcaster, "setLanguage").mockReturnValue(undefined);

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.colorTheme"]);

        expect(setSettings).toHaveBeenCalledWith(EDITOR);
        expect(setLanguage).not.toHaveBeenCalled();
    });

    it("re-pushes the language, not the settings, when the language setting changes", () => {
        const { broadcaster, editorStore } = createBroadcaster();
        const setSettings = vi.spyOn(broadcaster, "setSettings").mockResolvedValue(true);
        const setLanguage = vi.spyOn(broadcaster, "setLanguage").mockReturnValue(undefined);

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.language"]);

        expect(setLanguage).toHaveBeenCalledWith(EDITOR);
        expect(setSettings).not.toHaveBeenCalled();
    });

    it("ignores config changes outside the theme and language settings", () => {
        const { broadcaster, editorStore } = createBroadcaster();
        const setSettings = vi.spyOn(broadcaster, "setSettings").mockResolvedValue(true);
        const setLanguage = vi.spyOn(broadcaster, "setLanguage").mockReturnValue(undefined);

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.alignToOrigin", "editor.fontSize"]);

        expect(setSettings).not.toHaveBeenCalled();
        expect(setLanguage).not.toHaveBeenCalled();
    });

    it("guards a rejecting setSettings so the change listener never leaks a rejection", async () => {
        const { broadcaster, editorStore, notifier } = createBroadcaster();
        vi.spyOn(broadcaster, "setSettings").mockRejectedValue(new Error("post failed"));

        broadcaster.subscribe(EDITOR);
        fireSettingChange(editorStore, ["miragon.bpmnModeler.colorTheme"]);
        await Promise.resolve();
        await Promise.resolve();

        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});
