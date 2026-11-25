import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { executionPlatformAttributeNames, MODELER_NAMESPACE_URI } from "./engine";
import {
    ExecutionPlatformAttributes,
    type ExecutionPlatformDefinitions,
} from "./executionPlatformAttributes";

/** Shaped like Camunda's `modeler-moddle`: it reads the execution platform into typed properties. */
const MODELER_MODDLE = {
    name: "Camunda Modeler",
    prefix: "modeler",
    uri: MODELER_NAMESPACE_URI,
    xml: { tagAlias: "lowerCase" },
    types: [
        {
            name: "Definitions",
            isAbstract: true,
            extends: ["bpmn:Definitions"],
            properties: [
                { name: "executionPlatform", isAttr: true, type: "String" },
                { name: "executionPlatformVersion", isAttr: true, type: "String" },
            ],
        },
    ],
};

function declaringCamunda87Under(prefix: string, xml: string): string {
    return xml.replace(
        "<bpmn:definitions ",
        `<bpmn:definitions xmlns:${prefix}="${MODELER_NAMESPACE_URI}" ${prefix}:executionPlatform="Camunda Cloud" ${prefix}:executionPlatformVersion="8.7.0" `,
    );
}

function platformOf(attributes: Readonly<Record<string, string>>): {
    platform: string | undefined;
    version: string | undefined;
} {
    const names = executionPlatformAttributeNames(
        Object.entries(attributes).map(([name, value]) => ({ name, value })),
    );
    return { platform: attributes[names.platform], version: attributes[names.version] };
}

const PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

async function definitionsOf(
    xml: string,
    packages: Record<string, object> = {},
): Promise<ExecutionPlatformDefinitions> {
    const createModdle = await loadBpmnModdle();
    const { rootElement } = await createModdle(packages).fromXML(xml);
    return rootElement as unknown as ExecutionPlatformDefinitions;
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
        "reads the execution platform under the $prefix prefix when moddle registers $registers",
        async ({ prefix, packages }) => {
            const definitions = await definitionsOf(
                declaringCamunda87Under(prefix, PROCESS_XML),
                packages,
            );

            expect(platformOf(new ExecutionPlatformAttributes(definitions).read())).toStrictEqual({
                platform: "Camunda Cloud",
                version: "8.7.0",
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
