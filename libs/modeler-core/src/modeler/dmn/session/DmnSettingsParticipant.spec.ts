import { describe, expect, it } from "vitest";

import { LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { DmnSettingsBroadcaster } from "../service/DmnSettingsBroadcaster";
import { DmnSettingsParticipant } from "./DmnSettingsParticipant";

describe("DmnSettingsParticipant", () => {
    it("subscribes the broadcaster to the session's setting changes", async () => {
        const host = createTestHost();
        const broadcaster = new DmnSettingsBroadcaster(host.store, host.settings, host.notifier);
        const editor = await host.openSession("/work/decision.dmn", [
            new DmnSettingsParticipant(broadcaster),
        ]);

        host.settings.values.language = "de";
        editor.changeSetting("miragon.bpmnModeler.language");

        expect(editor.postedOfType<LanguageQuery>("LanguageQuery")).toEqual([
            new LanguageQuery("de"),
        ]);
    });
});
