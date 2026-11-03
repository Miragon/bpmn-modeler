import { beforeEach, describe, expect, it, vi } from "vitest";

import { Command } from "@miragon/bpmn-modeler-shared";

import { getDmnModelerSettingHandler } from "./dmnMessageHandlers";

const EDITOR = "file:///work/decision.dmn";
// A command the read-style handler ignores; a typed placeholder keeps signatures honest.
const ANY: Command = { type: "Ignored" } as Command;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("getDmnModelerSettingHandler", () => {
    it("asks the broadcaster to push settings and language for the editor", async () => {
        const settingsBroadcaster = {
            setSettings: vi.fn().mockResolvedValue(true),
            setLanguage: vi.fn(),
        };

        await getDmnModelerSettingHandler(settingsBroadcaster as never)(ANY, EDITOR);

        expect(settingsBroadcaster.setSettings).toHaveBeenCalledWith(EDITOR);
        expect(settingsBroadcaster.setLanguage).toHaveBeenCalledWith(EDITOR);
    });

    it("rejects when setSettings rejects so the router's dispatch catch logs it", async () => {
        const boom = new Error("settings failed");
        const settingsBroadcaster = {
            setSettings: vi.fn().mockRejectedValue(boom),
            setLanguage: vi.fn(),
        };

        await expect(
            getDmnModelerSettingHandler(settingsBroadcaster as never)(ANY, EDITOR),
        ).rejects.toThrow(boom);
    });
});
