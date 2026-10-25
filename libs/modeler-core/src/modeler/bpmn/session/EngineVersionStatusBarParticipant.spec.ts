import { describe, expect, it } from "vitest";

import { createTestHost } from "../../../testing";
import { EngineVersionStatusBarParticipant } from "./EngineVersionStatusBarParticipant";

const C8_XML = '<bpmn:definitions modeler:executionPlatformVersion="8.7.0"></bpmn:definitions>';

async function openDiagram({ focused }: { focused: boolean }) {
    const host = createTestHost();
    const participant = new EngineVersionStatusBarParticipant(host.statusBar, host.documents);
    const editor = await host.openSession("/work/diagram.bpmn", [participant], {
        content: C8_XML,
        focused,
    });
    return { statusBar: host.statusBar, editor };
}

describe("EngineVersionStatusBarParticipant", () => {
    it("shows the engine version when the editor gains focus", async () => {
        const { statusBar, editor } = await openDiagram({ focused: false });

        editor.becomeActive();

        expect(statusBar.engineVersion).toEqual({ platform: "c8", version: "8.7.0" });
    });

    it("hides the engine version when the editor loses focus", async () => {
        const { statusBar, editor } = await openDiagram({ focused: true });
        statusBar.showEngineVersion("c7", "7.22.0");

        editor.loseFocus();

        expect(statusBar.engineVersion).toBeUndefined();
    });

    it("hides the engine version on teardown", async () => {
        const { statusBar, editor } = await openDiagram({ focused: false });
        editor.becomeActive();

        editor.dispose();

        expect(statusBar.engineVersion).toBeUndefined();
    });

    it("stops tracking focus after the session closes", async () => {
        const { statusBar, editor } = await openDiagram({ focused: false });
        editor.dispose();

        editor.becomeActive();

        expect(statusBar.engineVersion).toBeUndefined();
    });
});
