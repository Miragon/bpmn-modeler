import { describe, expect, it } from "vitest";

import { definitionsOf } from "./__fixtures__/poolsAndLanes";
import { collaborationProcessesOf } from "./collaborationPools";
import { poolRelationsOf } from "./poolRelations";

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

    it("leaves out a participant without an id, as the pools do", async () => {
        const definitions = await definitionsOf(`
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>${PROCESSES}`);

        expect(collaborationProcessesOf(definitions)).toEqual([["Collab_1", "Process_B"]]);
        expect([...poolRelationsOf(definitions).pools]).toEqual(["Pool_B"]);
    });

    it("answers no pairs for a document without a collaboration", async () => {
        expect(collaborationProcessesOf(await definitionsOf(PROCESSES))).toEqual([]);
    });
});
