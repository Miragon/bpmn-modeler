import { describe, expect, it, vi } from "vitest";

import { elementXml } from "./elementXml";

// The scan and the parser agree on real files, so only a scan that misses a declaration reaches the guard.
vi.mock("./namespaceDeclarations", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./namespaceDeclarations")>()),
    namespaceDeclarations: async () => [],
}));

describe("elementXml", () => {
    it("rejects instead of writing a prefix the snippet does not declare", async () => {
        const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:team="urn:miragon:team" id="Definitions_1">
  <bpmn:process id="Process_1"><bpmn:task id="Task_1" team:owner="billing" /></bpmn:process>
</bpmn:definitions>`;

        await expect(elementXml(xml, "Task_1")).rejects.toThrow(
            "The XML of Task_1 uses the namespace prefix team, which it does not declare.",
        );
    });
});
