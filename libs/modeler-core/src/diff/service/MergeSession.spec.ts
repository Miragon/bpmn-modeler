import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MergeSession } from "./MergeSession";

// SPIKE: the smoke test's conflict, so the container run is not the first place it merges.
const BASE = readFileSync(
    resolve(__dirname, "../../../../../apps/vscode-plugin/test/smoke/fixtures/smoke.bpmn"),
    "utf8",
);
const CURRENT = BASE.replace('name="Check order"', 'name="Check current order"');
const INCOMING = BASE.replace('name="Check order"', 'name="Check incoming order"')
    .replace(
        "  </bpmn:process>",
        '    <bpmn:task id="Task_Notify" name="Notify customer" />\n  </bpmn:process>',
    )
    .replace(
        "    </bpmndi:BPMNPlane>",
        '      <bpmndi:BPMNShape id="Task_Notify_di" bpmnElement="Task_Notify">\n        <dc:Bounds x="240" y="220" width="100" height="80" />\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>',
    );

describe("MergeSession (spike)", () => {
    it("builds incoming's side of the smoke conflict once incoming is taken", async () => {
        const session = await MergeSession.start("file:///order.bpmn", {
            base: BASE,
            current: CURRENT,
            incoming: INCOMING,
        });
        expect(session.openConflictIds).toEqual(["Task_Check"]);
        await expect(session.build()).rejects.toThrow();

        const outcome = session.takeSideForEveryOpenConflict("incoming");

        expect(outcome).toEqual({ picked: ["Task_Check"], blocked: [], openConflicts: 0 });
        const { xml } = await session.build();
        expect(xml).toContain('name="Check incoming order"');
        expect(xml).toContain('id="Task_Notify"');
        expect(xml).toContain('bpmnElement="Task_Notify"');
        expect(xml).not.toContain("<<<<<<<");
    });
});
