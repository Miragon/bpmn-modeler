import { describe, expect, it } from "vitest";

import {
    detectEngine,
    ENGINE_EXECUTION_PLATFORM,
    ENGINE_LABEL,
    ENGINES,
    engineSupports,
    executionPlatformAttributeNames,
    isEngine,
    readDefinitionsStartTag,
    readStartTag,
    type EngineCapability,
} from "./engine";

const MODELER_NS = "http://camunda.org/schema/modeler/1.0";

function definitions(attributes: string): string {
    return `<bpmn:definitions xmlns:modeler="${MODELER_NS}" ${attributes} />`;
}

describe("ENGINES", () => {
    it("names the engines every per-engine table has an entry for", () => {
        expect([...ENGINES].sort()).toEqual(Object.keys(ENGINE_LABEL).sort());
        expect([...ENGINES].sort()).toEqual(Object.keys(ENGINE_EXECUTION_PLATFORM).sort());
    });
});

describe("isEngine", () => {
    it.each([
        ["c7", true],
        ["c8", true],
        ["c9", false],
        ["C8", false],
        ["", false],
        ["toString", false],
        [undefined, false],
        [null, false],
        [8, false],
    ])("judges %j", (value, expected) => {
        expect(isEngine(value)).toBe(expected);
    });
});

describe("detectEngine", () => {
    it("detects c7 from the Camunda Platform execution-platform name", () => {
        expect(detectEngine(definitions('modeler:executionPlatform="Camunda Platform"'))).toBe(
            "c7",
        );
    });

    it("detects c8 from the Camunda Cloud execution-platform name", () => {
        expect(detectEngine(definitions('modeler:executionPlatform="Camunda Cloud"'))).toBe("c8");
    });

    it("falls back to the version major digit when no platform name is present", () => {
        expect(detectEngine(definitions('modeler:executionPlatformVersion="7.23.0"'))).toBe("c7");
        expect(detectEngine(definitions('modeler:executionPlatformVersion="8.6.0"'))).toBe("c8");
    });

    it("prefers the platform name over a contradicting version", () => {
        expect(
            detectEngine(
                definitions(
                    'modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="8.6.0"',
                ),
            ),
        ).toBe("c7");
    });

    it("returns undefined for an unrecognised platform name and no usable version", () => {
        expect(
            detectEngine(definitions('modeler:executionPlatform="Some Other Platform"')),
        ).toBeUndefined();
    });

    it("returns undefined when there is no platform metadata", () => {
        expect(detectEngine("<bpmn:definitions />")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
        expect(detectEngine("")).toBeUndefined();
    });

    it("detects single-quoted attribute values", () => {
        expect(detectEngine(definitions("modeler:executionPlatform='Camunda Cloud'"))).toBe("c8");
    });

    it("tolerates whitespace around the equals sign", () => {
        expect(detectEngine(definitions('modeler:executionPlatform = "Camunda Cloud"'))).toBe("c8");
    });

    it("resolves the modeler prefix from the namespace binding", () => {
        const xml = `<bpmn:definitions xmlns:m="${MODELER_NS}" m:executionPlatform="Camunda Cloud" />`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("ignores a misleading comment before a genuine C8 root", () => {
        const xml = `<!-- modeler:executionPlatform="Camunda Platform" -->\n${definitions(
            'modeler:executionPlatform="Camunda Cloud"',
        )}`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("ignores misleading CDATA before a genuine C8 root", () => {
        const xml = `<?xml version="1.0"?><![CDATA[modeler:executionPlatform="Camunda Platform"]]>${definitions(
            'modeler:executionPlatform="Camunda Cloud"',
        )}`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("detects regardless of attribute order", () => {
        const xml = `<bpmn:definitions m:executionPlatform="Camunda Cloud" xmlns:m="${MODELER_NS}" />`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("skips the XML declaration and DOCTYPE before the root", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE definitions [<!ENTITY x "y">]>\n${definitions(
            'modeler:executionPlatform="Camunda Platform"',
        )}`;
        expect(detectEngine(xml)).toBe("c7");
    });

    it("skips a byte-order mark before the root", () => {
        const xml = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n${definitions(
            'modeler:executionPlatform="Camunda Cloud"',
        )}`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("returns undefined when the root element is not definitions", () => {
        expect(
            detectEngine(`<bpmn:process modeler:executionPlatform="Camunda Cloud" />`),
        ).toBeUndefined();
    });

    it("returns undefined for a bare attribute fragment without a root element", () => {
        expect(detectEngine('modeler:executionPlatform="Camunda Cloud"')).toBeUndefined();
    });

    it("still detects with the literal modeler prefix when no xmlns binding exists", () => {
        expect(detectEngine('<bpmn:definitions modeler:executionPlatform="Camunda Cloud" />')).toBe(
            "c8",
        );
    });

    it("does not throw and returns undefined on malformed markup", () => {
        expect(detectEngine("<bpmn:definitions")).toBeUndefined();
        expect(
            detectEngine('<bpmn:definitions modeler:executionPlatform="Camunda Cloud'),
        ).toBeUndefined();
        expect(detectEngine("<!-- unclosed comment")).toBeUndefined();
        expect(detectEngine("not xml at all")).toBeUndefined();
    });
});

const startTagParts = (xml: string) => {
    const startTag = readDefinitionsStartTag(xml);
    return (
        startTag && {
            attributes: startTag.attributes.map(({ name, value, start, end }) => ({
                name,
                value,
                text: xml.slice(start, end),
            })),
            afterAttributes: xml.slice(startTag.attributesEnd),
        }
    );
};

describe("readDefinitionsStartTag", () => {
    it.each([
        {
            given: "quoted attributes",
            xml: `<bpmn:definitions id="a" name = 'b c'>`,
            expected: {
                attributes: [
                    { name: "id", value: "a", text: 'id="a"' },
                    { name: "name", value: "b c", text: "name = 'b c'" },
                ],
                afterAttributes: ">",
            },
        },
        {
            given: "a self-closing root without attributes",
            xml: "<definitions />",
            expected: { attributes: [], afterAttributes: " />" },
        },
        {
            given: "a closing angle bracket inside a value",
            xml: `<?xml version="1.0"?>\n<definitions targetNamespace="a>b">\n<process />`,
            expected: {
                attributes: [
                    { name: "targetNamespace", value: "a>b", text: 'targetNamespace="a>b"' },
                ],
                afterAttributes: ">\n<process />",
            },
        },
        {
            given: "a root that is not definitions",
            xml: `<bpmn:process id="a">`,
            expected: undefined,
        },
    ])("reads $given", ({ xml, expected }) => {
        expect(startTagParts(xml)).toEqual(expected);
    });
});

describe("readStartTag", () => {
    it.each([
        {
            given: "a tag below the root",
            xml: `<definitions>\n  <bpmn:process isExecutable="true" id='P1'>`,
            expected: {
                name: "bpmn:process",
                attributes: [
                    { name: "isExecutable", value: "true" },
                    { name: "id", value: "P1" },
                ],
            },
        },
        {
            given: "a malformed tag below the root",
            xml: "<definitions>\n  <bpmn:process id=P1>",
            expected: undefined,
        },
    ])("reads $given", ({ xml, expected }) => {
        const startTag = readStartTag(xml, xml.indexOf("<bpmn:process"));
        expect(
            startTag && {
                name: startTag.name,
                attributes: startTag.attributes.map(({ name, value }) => ({ name, value })),
            },
        ).toEqual(expected);
    });
});

describe("executionPlatformAttributeNames", () => {
    it.each([
        {
            given: "the prefix bound to the modeler namespace",
            xml: `<definitions xmlns:modeler="urn:other" xmlns:cm="${MODELER_NS}" />`,
            expected: {
                namespace: "xmlns:cm",
                platform: "cm:executionPlatform",
                version: "cm:executionPlatformVersion",
            },
        },
        {
            given: "the modeler prefix without a binding",
            xml: `<definitions xmlns:cm="urn:other" />`,
            expected: {
                namespace: "xmlns:modeler",
                platform: "modeler:executionPlatform",
                version: "modeler:executionPlatformVersion",
            },
        },
    ])("names the attributes under $given", ({ xml, expected }) => {
        const attributes = readDefinitionsStartTag(xml)?.attributes ?? [];
        expect(executionPlatformAttributeNames(attributes)).toEqual(expected);
    });
});

describe("engineSupports", () => {
    it.each([
        { engine: "c7", capability: "verifiesDeployments", supported: true },
        { engine: "c8", capability: "verifiesDeployments", supported: false },
        { engine: "c7", capability: "inlineScripting", supported: true },
        { engine: "c8", capability: "inlineScripting", supported: false },
        { engine: "c7", capability: "transactionBoundaries", supported: true },
        { engine: "c8", capability: "transactionBoundaries", supported: false },
        { engine: "c7", capability: "formReferenceStatus", supported: false },
        { engine: "c8", capability: "formReferenceStatus", supported: true },
    ] as const)("$engine supports $capability: $supported", ({ engine, capability, supported }) => {
        expect(engineSupports(engine, capability)).toBe(supported);
    });

    it.each<EngineCapability>([
        "verifiesDeployments",
        "inlineScripting",
        "transactionBoundaries",
        "formReferenceStatus",
    ])("an undetected engine supports no %s", (capability) => {
        expect(engineSupports(undefined, capability)).toBe(false);
    });
});
