import { describe, expect, it } from "vitest";

import { LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { BpmnSettingsBroadcaster } from "../service/BpmnSettingsBroadcaster";
import { BpmnSettingsParticipant } from "./BpmnSettingsParticipant";

describe("BpmnSettingsParticipant", () => {
    it("subscribes the broadcaster to the session's setting changes", async () => {
        const host = createTestHost();
        const broadcaster = new BpmnSettingsBroadcaster(host.store, host.settings, host.notifier);
        const editor = await host.openSession("/work/diagram.bpmn", [
            new BpmnSettingsParticipant(broadcaster),
        ]);

        host.settings.values.language = "de";
        editor.changeSetting("miragon.bpmnModeler.language");

        expect(editor.postedOfType<LanguageQuery>("LanguageQuery")).toEqual([
            new LanguageQuery("de"),
        ]);
    });
});
