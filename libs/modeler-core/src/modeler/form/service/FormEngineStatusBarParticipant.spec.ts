import { describe, expect, it } from "vitest";

import { createTestHost } from "../../../testing";
import { EngineVersionStatusBarParticipant } from "../../bpmn/service/EngineVersionStatusBarParticipant";
import { FormEngineStatusBarParticipant } from "./FormEngineStatusBarParticipant";

const FORM = '{"executionPlatform":"Camunda Cloud","executionPlatformVersion":"8.8.0"}';
const BPMN =
    '<bpmn:definitions modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.22.0"/>';

function setup() {
    const host = createTestHost();
    return {
        host,
        form: new FormEngineStatusBarParticipant(host.statusBar, host.documents),
        bpmn: new EngineVersionStatusBarParticipant(host.statusBar, host.documents),
    };
}

describe("Form native engine status", () => {
    it("shows configured metadata immediately, tracks matching source changes and hides on disposal", async () => {
        const { host, form } = setup();
        const editor = await host.openSession("/work/a.form", [form], { content: FORM });
        expect(host.statusBar.views.engineVersion?.text).toBe("Camunda 8 (8.8.0)");
        editor.changeDocument(FORM.replace("8.8.0", "8.10.0"));
        expect(host.statusBar.views.engineVersion?.text).toBe("Camunda 8 (8.10.0)");
        editor.dispose();
        expect(host.statusBar.views.engineVersion).toBeUndefined();
    });

    it("never publishes a background Form or responds to a different document", async () => {
        const { host, form } = setup();
        const focused = await host.openSession("/work/a.form", [form], { content: FORM });
        const background = await host.openSession("/work/b.form", [form], {
            content: "{}",
            focused: false,
        });
        background.changeDocument('{"executionPlatform":"Other","executionPlatformVersion":"99"}');
        expect(host.statusBar.views.engineVersion?.text).toBe("Camunda 8 (8.8.0)");
        focused.loseFocus();
        expect(host.statusBar.views.engineVersion).toBeUndefined();
        background.becomeActive();
        expect(host.statusBar.views.engineVersion?.text).toBe("Other (99)");
        expect(background.content).toContain("Other");
    });

    it.each(["form", "bpmn"] as const)(
        "keeps the new %s owner's status through a late blur and disposal",
        async (next) => {
            const { host, form, bpmn } = setup();
            const formEditor = await host.openSession("/work/a.form", [form], {
                content: FORM,
                focused: false,
            });
            const bpmnEditor = await host.openSession("/work/a.bpmn", [bpmn], {
                content: BPMN,
                focused: false,
            });
            const [previous, current, text] =
                next === "form"
                    ? ([bpmnEditor, formEditor, "Camunda 8 (8.8.0)"] as const)
                    : ([formEditor, bpmnEditor, "Camunda 7 (7.22.0)"] as const);
            previous.becomeActive();
            current.becomeActive();
            previous.loseFocus();
            previous.dispose();
            expect(host.statusBar.views.engineVersion?.text).toBe(text);
        },
    );

    it("represents missing and invalid source without inventing metadata", async () => {
        const { host, form } = setup();
        const editor = await host.openSession("/work/a.form", [form], { content: "{}" });
        expect(host.statusBar.views.engineVersion?.tone).toBe("warning");
        expect(editor.content).toBe("{}");
        editor.changeDocument("{");
        expect(host.statusBar.views.engineVersion?.text).toBe("Invalid Form JSON");
        expect(editor.content).toBe("{");
    });
});
