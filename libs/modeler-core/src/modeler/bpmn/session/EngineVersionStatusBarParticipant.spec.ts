import { describe, expect, it } from "vitest";

import { createTestHost } from "../../../testing";
import { EngineVersionStatusBarParticipant } from "./EngineVersionStatusBarParticipant";

const C8_XML = '<bpmn:definitions modeler:executionPlatformVersion="8.7.0"></bpmn:definitions>';
const C7_XML =
    '<bpmn:definitions modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.22.0"></bpmn:definitions>';

function createParticipant() {
    const host = createTestHost();
    const participant = new EngineVersionStatusBarParticipant(host.statusBar, host.documents);
    return { host, participant };
}

async function openDiagram({ focused }: { focused: boolean }) {
    const { host, participant } = createParticipant();
    const editor = await host.openSession("/work/diagram.bpmn", [participant], {
        content: C8_XML,
        focused,
    });
    return { statusBar: host.statusBar, editor };
}

async function openTwoBackgroundDiagrams() {
    const { host, participant } = createParticipant();
    const c8Editor = await host.openSession("/work/a.bpmn", [participant], {
        content: C8_XML,
        focused: false,
    });
    const c7Editor = await host.openSession("/work/b.bpmn", [participant], {
        content: C7_XML,
        focused: false,
    });
    return { statusBar: host.statusBar, c8Editor, c7Editor };
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

    it("hides the engine version when the editor focused at open closes", async () => {
        const { statusBar, editor } = await openDiagram({ focused: true });
        statusBar.showEngineVersion("c8", "8.7.0");

        editor.dispose();

        expect(statusBar.engineVersion).toBeUndefined();
    });

    it("stops tracking focus after the session closes", async () => {
        const { statusBar, editor } = await openDiagram({ focused: false });
        editor.dispose();

        editor.becomeActive();

        expect(statusBar.engineVersion).toBeUndefined();
    });

    it("keeps the focused editor's engine version when a background editor closes", async () => {
        const { statusBar, c8Editor, c7Editor } = await openTwoBackgroundDiagrams();
        c8Editor.becomeActive();

        c7Editor.dispose();

        expect(statusBar.engineVersion).toEqual({ platform: "c8", version: "8.7.0" });
    });

    it("keeps the newly focused editor's engine version when the previous editor blurs after it", async () => {
        const { statusBar, c8Editor, c7Editor } = await openTwoBackgroundDiagrams();
        c8Editor.becomeActive();

        c7Editor.becomeActive();
        c8Editor.loseFocus();

        expect(statusBar.engineVersion).toEqual({ platform: "c7", version: "7.22.0" });
    });
});
