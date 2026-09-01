import { beforeEach, describe, expect, it, vi } from "vitest";

// Importing the handler module pulls in `VsCodeNotifier`/`WebviewMessageRouter`,
// which reference vscode; a bare stub is enough since the handlers under test
// only ever touch their injected service doubles.
vi.mock("vscode", () => ({}));

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import {
    getDmnFileHandler,
    getDmnModelerSettingHandler,
    syncDmnDocumentHandler,
} from "./dmnMessageHandlers";

const EDITOR = "file:///work/decision.dmn";
// A command the read-style handler ignores; a typed placeholder keeps signatures honest.
const ANY: Command = { type: "Ignored" } as Command;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("getDmnFileHandler", () => {
    it("logs readiness only when the diagram actually rendered", async () => {
        const dmnService = { display: vi.fn().mockResolvedValue(true) };
        const notifier = { logDebug: vi.fn() };

        await getDmnFileHandler(dmnService as never, notifier as never)(ANY, EDITOR);

        expect(dmnService.display).toHaveBeenCalledWith(EDITOR);
        expect(notifier.logDebug).toHaveBeenCalledOnce();
    });

    it("does not log when rendering was skipped", async () => {
        const dmnService = { display: vi.fn().mockResolvedValue(false) };
        const notifier = { logDebug: vi.fn() };

        await getDmnFileHandler(dmnService as never, notifier as never)(ANY, EDITOR);

        expect(notifier.logDebug).not.toHaveBeenCalled();
    });
});

describe("getDmnModelerSettingHandler", () => {
    it("asks the broadcaster to push settings for the editor", () => {
        const settingsBroadcaster = { setSettings: vi.fn() };

        getDmnModelerSettingHandler(settingsBroadcaster as never)(ANY, EDITOR);

        expect(settingsBroadcaster.setSettings).toHaveBeenCalledWith(EDITOR);
    });

    it("rejects when setSettings rejects so the router's dispatch catch logs it", async () => {
        const boom = new Error("settings failed");
        const settingsBroadcaster = { setSettings: vi.fn().mockRejectedValue(boom) };

        await expect(
            getDmnModelerSettingHandler(settingsBroadcaster as never)(ANY, EDITOR),
        ).rejects.toThrow(boom);
    });
});

describe("syncDmnDocumentHandler", () => {
    it("forwards the editor id and command content to sync", async () => {
        const dmnService = { sync: vi.fn().mockResolvedValue(undefined) };

        await syncDmnDocumentHandler(dmnService as never)(
            new SyncDocumentCommand("<dmn/>"),
            EDITOR,
        );

        expect(dmnService.sync).toHaveBeenCalledWith(EDITOR, "<dmn/>", 0);
    });
});
