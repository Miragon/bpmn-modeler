import { describe, expect, it } from "vitest";

import { Engine } from "@miragon/bpmn-modeler-types";

import { ExecutionPlatformNotDetectedError } from "./errors";
import { BpmnDocument } from "./BpmnDocument";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const c7Xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1jpphon" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.21.0" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1aiafvx" isExecutable="true" >
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const c8Xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.5.0">
  <bpmn:process id="Process_8" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

// Has namespace but no executionPlatformVersion attribute.
const c7XmlNoVersion = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0">
  <bpmn:process id="Process_0" isExecutable="true" />
</bpmn:definitions>`;

// Has the executionPlatform name but no version attribute.
const c8XmlNameOnly = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" modeler:executionPlatform="Camunda Cloud">
  <bpmn:process id="Process_0" isExecutable="true" />
</bpmn:definitions>`;

// No platform signal at all.
const unknownXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0">
</bpmn:definitions>`;

// A version whose major digit names no Camunda platform.
const unknownPlatformVersionXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" modeler:executionPlatformVersion="9.1.0">
</bpmn:definitions>`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("BpmnDocument.isEmpty", () => {
    it("should return true for an empty string", () => {
        expect(new BpmnDocument("").isEmpty()).toBe(true);
    });

    it("should return false for non-empty XML", () => {
        expect(new BpmnDocument(c7Xml).isEmpty()).toBe(false);
    });
});

describe("BpmnDocument.empty", () => {
    it("should return a C7 diagram containing the given version", () => {
        const doc = BpmnDocument.empty("c7", "7.24.0");
        expect(doc.xml).toContain('modeler:executionPlatformVersion="7.24.0"');
        expect(doc.xml).toContain('modeler:executionPlatform="Camunda Platform"');
        expect(doc.xml).toContain("xmlns:camunda=");
    });

    it("should return a C8 diagram containing the given version", () => {
        const doc = BpmnDocument.empty("c8", "8.8.0");
        expect(doc.xml).toContain('modeler:executionPlatformVersion="8.8.0"');
        expect(doc.xml).toContain('modeler:executionPlatform="Camunda Cloud"');
        expect(doc.xml).toContain("xmlns:zeebe=");
    });
});

describe("BpmnDocument.detectPlatform", () => {
    it("should detect C7 from executionPlatformVersion attribute", () => {
        expect(new BpmnDocument(c7Xml).detectPlatform()).toBe("c7");
    });

    it("should detect C8 from executionPlatformVersion attribute", () => {
        expect(new BpmnDocument(c8Xml).detectPlatform()).toBe("c8");
    });

    it("should detect C7 from xmlns:camunda namespace when version attribute is absent", () => {
        expect(new BpmnDocument(c7XmlNoVersion).detectPlatform()).toBe("c7");
    });

    it("should detect the platform from the executionPlatform name when version is absent", () => {
        expect(new BpmnDocument(c8XmlNameOnly).detectPlatform()).toBe("c8");
    });

    it("should throw ExecutionPlatformNotDetectedError when no platform signal exists", () => {
        expect(() => new BpmnDocument(unknownXml).detectPlatform()).toThrow(
            ExecutionPlatformNotDetectedError,
        );
    });
});

describe("BpmnDocument.detectEngine", () => {
    it("detects the platform like detectPlatform", () => {
        expect(new BpmnDocument(c7Xml).detectEngine()).toBe("c7");
        expect(new BpmnDocument(c8Xml).detectEngine()).toBe("c8");
        expect(new BpmnDocument(c7XmlNoVersion).detectEngine()).toBe("c7");
        expect(new BpmnDocument(c8XmlNameOnly).detectEngine()).toBe("c8");
    });

    it("returns undefined for an untagged model instead of throwing", () => {
        expect(new BpmnDocument(unknownXml).detectEngine()).toBeUndefined();
    });

    it.each([
        {
            declaration: "a single-quoted xmlns:zeebe",
            xml: diagram("xmlns:zeebe='http://camunda.org/schema/zeebe/1.0'"),
            engine: "c8",
        },
        {
            declaration: "the Camunda 7 namespace under another prefix",
            xml: diagram('xmlns:c7="http://camunda.org/schema/1.0/bpmn"'),
            engine: "c7",
        },
        {
            declaration: "both engine namespaces",
            xml: diagram(ZEEBE_NAMESPACE, CAMUNDA_NAMESPACE),
            engine: "c7",
        },
    ])("detects $engine from a definitions root declaring $declaration", ({ xml, engine }) => {
        expect(new BpmnDocument(xml).detectEngine()).toBe(engine);
    });

    it.each([
        {
            given: "an engine namespace in a comment that is the whole file",
            xml: `<!-- ${CAMUNDA_NAMESPACE} -->`,
        },
        {
            given: "an engine namespace on a root that is not definitions",
            xml: `<foo ${ZEEBE_NAMESPACE}/>`,
        },
        {
            given: "an engine namespace in a comment before an engine-neutral root",
            xml: BpmnDocument.emptyEngineNeutral().xml.replace(
                "<bpmn:definitions",
                `<!-- copied from ${ZEEBE_NAMESPACE} -->\n<bpmn:definitions`,
            ),
        },
        {
            given: "an engine namespace on a child element of an engine-neutral root",
            xml: diagramWith(`<bpmn:process id="Process_1" ${CAMUNDA_NAMESPACE} />`),
        },
        {
            given: "an engine namespace as the target namespace",
            xml: diagram('targetNamespace="http://camunda.org/schema/zeebe/1.0"'),
        },
        {
            given: "the camunda prefix bound to another namespace",
            xml: diagram('xmlns:camunda="http://activiti.org/bpmn"'),
        },
    ])("leaves $given undetected", ({ xml }) => {
        expect(new BpmnDocument(xml).detectEngine()).toBeUndefined();
    });
});

describe("BpmnDocument.emptyEngineNeutral", () => {
    it("scaffolds an untagged, non-executable diagram", () => {
        const doc = BpmnDocument.emptyEngineNeutral();
        expect(doc.detectEngine()).toBeUndefined();
        expect(doc.xml).toContain('isExecutable="false"');
        expect(doc.xml).not.toContain("modeler:executionPlatform");
        expect(doc.xml).not.toContain("xmlns:camunda");
        expect(doc.xml).not.toContain("xmlns:zeebe");
        expect(doc.xml).not.toContain("exporter");
    });
});

describe("BpmnDocument.forNewModel", () => {
    it("scaffolds the engine-neutral diagram for 'neutral'", () => {
        expect(BpmnDocument.forNewModel("neutral").detectEngine()).toBeUndefined();
    });

    it("stamps a concrete engine at its latest version", () => {
        expect(BpmnDocument.forNewModel("c7").detectEngine()).toBe("c7");
        expect(BpmnDocument.forNewModel("c8").detectEngine()).toBe("c8");
    });
});

describe("BpmnDocument.detectPlatformVersion", () => {
    it.each([
        { given: "a C7 diagram", xml: c7Xml, version: "7.20.0" },
        { given: "a C8 diagram", xml: c8Xml, version: "8.5.0" },
        {
            given: "a diagram that binds the modeler namespace to another prefix",
            xml: diagram(
                CUSTOM_PREFIX_MODELER_NAMESPACE,
                CUSTOM_PREFIX_C8_PLATFORM,
                customPrefixPlatformVersion("8.8.0"),
            ),
            version: "8.8.0",
        },
        {
            given: "a single-quoted attribute",
            xml: diagram(
                MODELER_NAMESPACE,
                C8_PLATFORM,
                "modeler:executionPlatformVersion='8.8.0'",
            ),
            version: "8.8.0",
        },
        {
            given: "a version with a two-digit minor and patch",
            xml: diagram(MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.10.12")),
            version: "8.10.12",
        },
        {
            given: "a version with a two-digit major",
            xml: diagram(MODELER_NAMESPACE, platformVersion("10.0.0")),
            version: "10.0.0",
        },
    ])("reads $version from $given", ({ xml, version }) => {
        expect(new BpmnDocument(xml).detectPlatformVersion()).toBe(version);
    });

    it.each([
        { given: "a diagram without a version", xml: c7XmlNoVersion },
        {
            given: "a two-part version",
            xml: diagram(MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.6")),
        },
        {
            given: "a version with leading text",
            xml: diagram(MODELER_NAMESPACE, C8_PLATFORM, platformVersion("v8.8.0")),
        },
        {
            given: "a version with trailing text",
            xml: diagram(MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.8.0-alpha")),
        },
        {
            given: "a diagram whose version text appears only in a documentation body",
            xml: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${MODELER_NAMESPACE} ${C8_PLATFORM}>
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:documentation>${platformVersion("9.9.9")}</bpmn:documentation>
  </bpmn:process>
</bpmn:definitions>`,
        },
    ])("reads no version from $given", ({ xml }) => {
        expect(new BpmnDocument(xml).detectPlatformVersion()).toBeUndefined();
    });
});

describe("BpmnDocument.engineVersionStatus", () => {
    it.each([
        { diagram: "a C7 diagram", xml: c7Xml, platform: "c7", version: "7.20.0" },
        { diagram: "a C8 diagram", xml: c8Xml, platform: "c8", version: "8.5.0" },
    ])("shows the platform and version of $diagram", ({ xml, platform, version }) => {
        expect(new BpmnDocument(xml).engineVersionStatus()).toEqual({ platform, version });
    });

    it.each([
        { diagram: "a C7 diagram known only by its namespace", xml: c7XmlNoVersion },
        { diagram: "a C8 diagram without a version", xml: c8XmlNameOnly },
        { diagram: "a diagram without an execution platform", xml: unknownXml },
        { diagram: "a version of no known platform", xml: unknownPlatformVersionXml },
        { diagram: "an empty document", xml: "" },
    ])("shows nothing for $diagram", ({ xml }) => {
        expect(new BpmnDocument(xml).engineVersionStatus()).toBeUndefined();
    });
});

const CAMUNDA_NAMESPACE = 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"';
const ZEEBE_NAMESPACE = 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
const MODELER_NAMESPACE = 'xmlns:modeler="http://camunda.org/schema/modeler/1.0"';
const C7_PLATFORM = 'modeler:executionPlatform="Camunda Platform"';
const C8_PLATFORM = 'modeler:executionPlatform="Camunda Cloud"';
const platformVersion = (version: string) => `modeler:executionPlatformVersion="${version}"`;
const CUSTOM_PREFIX_MODELER_NAMESPACE = 'xmlns:cm="http://camunda.org/schema/modeler/1.0"';
const CUSTOM_PREFIX_C8_PLATFORM = 'cm:executionPlatform="Camunda Cloud"';
const customPrefixPlatformVersion = (version: string) => `cm:executionPlatformVersion="${version}"`;

const diagram = (...rootAttributes: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${rootAttributes.join(" ")}>
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const diagramBehindDefinitionsComment = (
    ...rootAttributes: string[]
) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- <bpmn:definitions> -->
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${rootAttributes.join(" ")}>
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const defaultNamespaceDiagram = (
    ...rootAttributes: string[]
) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" ${rootAttributes.join(" ")}>
  <process id="Process_1" isExecutable="true" />
</definitions>`;

const migrationOf = (xml: string, engine: Engine, version: string) => {
    const outcome = new BpmnDocument(xml).migratedTo(engine, version);
    return outcome.kind === "unchanged"
        ? outcome
        : { kind: outcome.kind, xml: outcome.document.xml };
};

const migrations: {
    given: string;
    xml: string;
    engine: Engine;
    version: string;
    expected: ReturnType<typeof migrationOf>;
}[] = [
    {
        given: "a tagged C7 diagram at another version",
        xml: diagram(CAMUNDA_NAMESPACE, MODELER_NAMESPACE, C7_PLATFORM, platformVersion("7.20.0")),
        engine: "c7",
        version: "7.21.0",
        expected: {
            kind: "versionReplaced",
            xml: diagram(
                CAMUNDA_NAMESPACE,
                MODELER_NAMESPACE,
                C7_PLATFORM,
                platformVersion("7.21.0"),
            ),
        },
    },
    {
        given: "a tagged C8 diagram with a two-part version",
        xml: diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.6")),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "versionReplaced",
            xml: diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.8.0")),
        },
    },
    {
        given: "a tagged C8 diagram with a single-quoted version",
        xml: diagram(
            ZEEBE_NAMESPACE,
            MODELER_NAMESPACE,
            C8_PLATFORM,
            "modeler:executionPlatformVersion='8.6.0'",
        ),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "versionReplaced",
            xml: diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.8.0")),
        },
    },
    {
        given: "a C8 diagram detected through its zeebe namespace",
        xml: diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.8.0")),
        },
    },
    {
        given: "a C8 diagram detected through its execution platform",
        xml: diagram(MODELER_NAMESPACE, C8_PLATFORM),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(MODELER_NAMESPACE, C8_PLATFORM, ZEEBE_NAMESPACE, platformVersion("8.8.0")),
        },
    },
    {
        given: "a C7 diagram detected through its execution platform",
        xml: diagram(MODELER_NAMESPACE, C7_PLATFORM),
        engine: "c7",
        version: "7.24.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(
                MODELER_NAMESPACE,
                C7_PLATFORM,
                CAMUNDA_NAMESPACE,
                platformVersion("7.24.0"),
            ),
        },
    },
    {
        given: "a C8 diagram with a two-part version and no execution platform",
        xml: diagram(MODELER_NAMESPACE, platformVersion("8.6")),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(MODELER_NAMESPACE, platformVersion("8.8.0"), ZEEBE_NAMESPACE, C8_PLATFORM),
        },
    },
    {
        given: "a C7 diagram without the modeler namespace",
        xml: diagram(CAMUNDA_NAMESPACE),
        engine: "c7",
        version: "7.24.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(
                CAMUNDA_NAMESPACE,
                MODELER_NAMESPACE,
                C7_PLATFORM,
                platformVersion("7.24.0"),
            ),
        },
    },
    {
        given: "a C8 diagram whose definitions root is in the default namespace",
        xml: defaultNamespaceDiagram(ZEEBE_NAMESPACE),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: defaultNamespaceDiagram(
                ZEEBE_NAMESPACE,
                MODELER_NAMESPACE,
                C8_PLATFORM,
                platformVersion("8.8.0"),
            ),
        },
    },
    {
        given: "a C8 diagram with a self-closing definitions root",
        xml: `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${ZEEBE_NAMESPACE} />`,
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${ZEEBE_NAMESPACE} ${MODELER_NAMESPACE} ${C8_PLATFORM} ${platformVersion("8.8.0")} />`,
        },
    },
    {
        given: "a tagged C8 diagram whose modeler namespace has a custom prefix",
        xml: diagram(
            CUSTOM_PREFIX_MODELER_NAMESPACE,
            CUSTOM_PREFIX_C8_PLATFORM,
            customPrefixPlatformVersion("8.6.0"),
        ),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "versionReplaced",
            xml: diagram(
                CUSTOM_PREFIX_MODELER_NAMESPACE,
                CUSTOM_PREFIX_C8_PLATFORM,
                customPrefixPlatformVersion("8.8.0"),
            ),
        },
    },
    {
        given: "a C8 diagram without a version whose modeler namespace has a custom prefix",
        xml: diagram(CUSTOM_PREFIX_MODELER_NAMESPACE, CUSTOM_PREFIX_C8_PLATFORM),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(
                CUSTOM_PREFIX_MODELER_NAMESPACE,
                CUSTOM_PREFIX_C8_PLATFORM,
                ZEEBE_NAMESPACE,
                customPrefixPlatformVersion("8.8.0"),
            ),
        },
    },
    {
        given: "an untagged C8 diagram whose modeler namespace has a custom prefix",
        xml: diagram(ZEEBE_NAMESPACE, CUSTOM_PREFIX_MODELER_NAMESPACE),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(
                ZEEBE_NAMESPACE,
                CUSTOM_PREFIX_MODELER_NAMESPACE,
                CUSTOM_PREFIX_C8_PLATFORM,
                customPrefixPlatformVersion("8.8.0"),
            ),
        },
    },
    {
        given: "a C8 diagram behind a comment that holds a definitions tag",
        xml: diagramBehindDefinitionsComment(ZEEBE_NAMESPACE),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagramBehindDefinitionsComment(
                ZEEBE_NAMESPACE,
                MODELER_NAMESPACE,
                C8_PLATFORM,
                platformVersion("8.8.0"),
            ),
        },
    },
    {
        given: "a C8 diagram with a closing angle bracket in a root attribute value",
        xml: diagram('targetNamespace="urn:a>b"', ZEEBE_NAMESPACE),
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "platformStamped",
            xml: diagram(
                'targetNamespace="urn:a>b"',
                ZEEBE_NAMESPACE,
                MODELER_NAMESPACE,
                C8_PLATFORM,
                platformVersion("8.8.0"),
            ),
        },
    },
    {
        given: "a tagged C8 diagram behind a byte-order mark",
        xml: `\uFEFF${diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.6.0"))}`,
        engine: "c8",
        version: "8.8.0",
        expected: {
            kind: "versionReplaced",
            xml: `\uFEFF${diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.8.0"))}`,
        },
    },
    {
        given: "a tagged C8 diagram already at the version",
        xml: diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion("8.8.0")),
        engine: "c8",
        version: "8.8.0",
        expected: { kind: "unchanged" },
    },
];

describe("BpmnDocument.migratedTo", () => {
    it.each(migrations)("migrates $given", ({ xml, engine, version, expected }) => {
        expect(migrationOf(xml, engine, version)).toEqual(expected);
    });

    it.each(migrations)("leaves $given unchanged once migrated", ({ xml, engine, version }) => {
        const outcome = new BpmnDocument(xml).migratedTo(engine, version);
        const migrated = outcome.kind === "unchanged" ? new BpmnDocument(xml) : outcome.document;

        expect(migrated.migratedTo(engine, version)).toEqual({ kind: "unchanged" });
    });

    it.each([
        {
            given: "a C7 diagram to Camunda 8",
            xml: diagram(
                CAMUNDA_NAMESPACE,
                MODELER_NAMESPACE,
                C7_PLATFORM,
                platformVersion("7.20.0"),
            ),
            engine: "c8" as const,
            error: "The diagram is not a Camunda 8 diagram.",
        },
        {
            given: "an untagged diagram",
            xml: diagram(MODELER_NAMESPACE),
            engine: "c7" as const,
            error: "The diagram is not a Camunda 7 diagram.",
        },
        {
            given: "a document without a definitions root",
            xml: `<bpmn:process ${ZEEBE_NAMESPACE} id="Process_1" />`,
            engine: "c8" as const,
            error: "The BPMN file does not contain a `definitions` root element.",
        },
    ])("refuses to migrate $given", ({ xml, engine, error }) => {
        expect(() => new BpmnDocument(xml).migratedTo(engine, "8.8.0")).toThrow(error);
    });
});

const BPMN_NAMESPACE_URI = "http://www.omg.org/spec/BPMN/20100524/MODEL";

const diagramWith = (...rootElements: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${BPMN_NAMESPACE_URI}" id="Definitions_1">
  ${rootElements.join("\n  ")}
</bpmn:definitions>`;

const bpmn2Diagram = (rootAttributeBeforeBinding: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions ${rootAttributeBeforeBinding} xmlns:bpmn2="${BPMN_NAMESPACE_URI}" id="Definitions_1">
  <bpmn2:process id="P2" isExecutable="true" />
</bpmn2:definitions>`;

const POOLS = `<bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_External" processRef="External" />
    <bpmn:participant id="Participant_Main" processRef="Main" />
  </bpmn:collaboration>`;

describe("BpmnDocument.extractProcessId", () => {
    it.each([
        { given: "a C7 diagram", xml: c7Xml, processId: "Process_1aiafvx" },
        {
            given: "a process whose id follows another attribute",
            xml: diagramWith('<bpmn:process isExecutable="true" id="P1" />'),
            processId: "P1",
        },
        {
            given: "a diagram that binds the BPMN namespace to bpmn2",
            xml: bpmn2Diagram('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'),
            processId: "P2",
        },
        {
            given: "a diagram whose targetNamespace names the BPMN namespace",
            xml: bpmn2Diagram(`targetNamespace="${BPMN_NAMESPACE_URI}"`),
            processId: "P2",
        },
        {
            given: "a process outside a definitions root",
            xml: '<bpmn:process id="P1" isExecutable="true" />',
            processId: "P1",
        },
        {
            given: "a diagram in the default BPMN namespace",
            xml: defaultNamespaceDiagram(),
            processId: "Process_1",
        },
        {
            given: "a collaboration whose first process is not executable",
            xml: diagramWith(
                POOLS,
                '<bpmn:process id="External" isExecutable="false" />',
                '<bpmn:process id="Main" isExecutable="true" />',
            ),
            processId: "Main",
        },
        {
            given: "a collaboration without an executable process",
            xml: diagramWith(
                POOLS,
                '<bpmn:process id="External" isExecutable="false" />',
                '<bpmn:process id="Main" isExecutable="false" />',
            ),
            processId: "External",
        },
        {
            given: "a diagram whose first process has no id",
            xml: diagramWith('<bpmn:process isExecutable="false" />', '<bpmn:process id="P1" />'),
            processId: "P1",
        },
        {
            given: "a longer element name that begins with the process name",
            xml: diagramWith(
                '<bpmn:processing id="Other" isExecutable="true" />',
                '<bpmn:process id="P1" isExecutable="true" />',
            ),
            processId: "P1",
        },
        {
            given: "a diagram whose first process tag is malformed",
            xml: diagramWith(
                '<bpmn:process id=Broken isExecutable="true" />',
                '<bpmn:process id="P1" isExecutable="true" />',
            ),
            processId: "P1",
        },
    ])("reads $processId from $given", ({ xml, processId }) => {
        expect(new BpmnDocument(xml).extractProcessId()).toBe(processId);
    });

    it.each([
        { given: "a diagram without a process", xml: unknownXml, element: "bpmn:process" },
        {
            given: "a bpmn2 diagram without a process",
            xml: `<bpmn2:definitions xmlns:bpmn2="${BPMN_NAMESPACE_URI}" id="Definitions_1">
  <bpmn2:collaboration id="Collaboration_1" />
</bpmn2:definitions>`,
            element: "bpmn2:process",
        },
        {
            given: "a bpmn2 diagram whose process has no id",
            xml: `<bpmn2:definitions xmlns:bpmn2="${BPMN_NAMESPACE_URI}" id="Definitions_1">
  <bpmn2:process isExecutable="true" />
</bpmn2:definitions>`,
            element: "bpmn2:process",
        },
        {
            given: "a default-namespace diagram without a process",
            xml: `<definitions xmlns="${BPMN_NAMESPACE_URI}" id="Definitions_1" />`,
            element: "process",
        },
    ])("names the missing <$element> for $given", ({ xml, element }) => {
        expect(() => new BpmnDocument(xml).extractProcessId()).toThrow(
            `No <${element}> element with an id attribute found in the BPMN file.`,
        );
    });
});
