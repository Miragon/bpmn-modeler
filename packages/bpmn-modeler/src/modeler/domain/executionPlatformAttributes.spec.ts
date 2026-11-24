import { BpmnModdle } from "bpmn-moddle";
import { describe, expect, it } from "vitest";

import { deriveEngines } from "./engines";
import { ExecutionPlatformAttributes, type ModdleDefinitions } from "./executionPlatformAttributes";
import { MODELER_MODDLE, declaringCamunda87Under } from "../../__fixtures__/modelerModdle";

const PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

async function definitionsOf(
    xml: string,
    packages: Record<string, object> = {},
): Promise<ModdleDefinitions> {
    const { rootElement } = await BpmnModdle(packages).fromXML(xml);
    return rootElement as unknown as ModdleDefinitions;
}

interface ModdleCase {
    prefix: string;
    registers: string;
    packages: Record<string, object>;
}

const MODDLE_CASES: ModdleCase[] = [
    { prefix: "modeler", registers: "no package", packages: {} },
    { prefix: "cm", registers: "no package", packages: {} },
    {
        prefix: "modeler",
        registers: "a modeler package",
        packages: { modeler: MODELER_MODDLE },
    },
    { prefix: "cm", registers: "a modeler package", packages: { modeler: MODELER_MODDLE } },
];

describe("ExecutionPlatformAttributes.read", () => {
    it.each<ModdleCase>(MODDLE_CASES)(
        "reads the engine profile under the $prefix prefix when moddle registers $registers",
        async ({ prefix, packages }) => {
            const definitions = await definitionsOf(
                declaringCamunda87Under(prefix, PROCESS_XML),
                packages,
            );

            expect(
                deriveEngines(new ExecutionPlatformAttributes(definitions).read()),
            ).toStrictEqual({
                camunda: "8.7.0",
            });
        },
    );

    it("reads no platform from a diagram that declares none under a registered package", async () => {
        const definitions = await definitionsOf(PROCESS_XML, { modeler: MODELER_MODDLE });

        expect(new ExecutionPlatformAttributes(definitions).read()).toStrictEqual({
            "xmlns:modeler": MODELER_MODDLE.uri,
        });
    });
});

describe("ExecutionPlatformAttributes.version", () => {
    it.each<ModdleCase>(MODDLE_CASES)(
        "reads the engine version under the $prefix prefix when moddle registers $registers",
        async ({ prefix, packages }) => {
            const definitions = await definitionsOf(
                declaringCamunda87Under(prefix, PROCESS_XML),
                packages,
            );

            expect(new ExecutionPlatformAttributes(definitions).version()).toBe("8.7.0");
        },
    );

    it("reads no engine version from a diagram that declares none", async () => {
        const definitions = await definitionsOf(PROCESS_XML);

        expect(new ExecutionPlatformAttributes(definitions).version()).toBeUndefined();
    });
});
