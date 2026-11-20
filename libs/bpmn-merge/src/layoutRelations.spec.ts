import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { collaborationProcessesOf } from "./layoutRelations";

async function definitionsOf(semantic: string) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">${semantic}
</bpmn:definitions>`;
    return (await parseWithoutWarnings(xml)).rootElement;
}

const PROCESSES = `
  <bpmn:process id="Process_A" />
  <bpmn:process id="Process_B" />`;

describe("collaborationProcessesOf", () => {
    it("pairs each collaboration with the processes its participants name, in document order", async () => {
        const definitions = await definitionsOf(`
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>
  <bpmn:collaboration id="Collab_2">
    <bpmn:participant id="Pool_B2" processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}`);

        expect(collaborationProcessesOf(definitions)).toEqual([
            ["Collab_1", "Process_A"],
            ["Collab_1", "Process_B"],
            ["Collab_2", "Process_B"],
        ]);
    });

    it("leaves out a participant that names no process", async () => {
        const definitions = await definitionsOf(`
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_Black_Box" />
    <bpmn:participant id="Pool_A" processRef="Process_A" />
  </bpmn:collaboration>${PROCESSES}`);

        expect(collaborationProcessesOf(definitions)).toEqual([["Collab_1", "Process_A"]]);
    });

    it("answers no pairs for a document without a collaboration", async () => {
        expect(collaborationProcessesOf(await definitionsOf(PROCESSES))).toEqual([]);
    });
});
