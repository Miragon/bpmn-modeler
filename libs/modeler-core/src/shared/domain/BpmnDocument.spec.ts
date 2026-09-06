import { describe, expect, it } from "vitest";

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

// For withExecutionPlatform tests — matches the original bpmnUtils.spec.ts fixture.
const xmlWithoutPlatform = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1jpphon" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.21.0">
  <bpmn:process id="Process_1aiafvx" isExecutable="true" >
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1aiafvx">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const xmlWithPlatform = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1jpphon" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.21.0" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1aiafvx" isExecutable="true" >
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1aiafvx">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
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
    it("should return the version string when present", () => {
        expect(new BpmnDocument(c7Xml).detectPlatformVersion()).toBe("7.20.0");
        expect(new BpmnDocument(c8Xml).detectPlatformVersion()).toBe("8.5.0");
    });

    it("should return undefined when the attribute is absent", () => {
        expect(new BpmnDocument(c7XmlNoVersion).detectPlatformVersion()).toBeUndefined();
    });
});

describe("BpmnDocument.withVersion", () => {
    it("should replace the version attribute", () => {
        const updated = new BpmnDocument(c7Xml).withVersion("7.24.0");
        expect(updated.xml).toContain('modeler:executionPlatformVersion="7.24.0"');
        expect(updated.xml).not.toContain('modeler:executionPlatformVersion="7.20.0"');
    });

    it("should not mutate the original document", () => {
        const original = new BpmnDocument(c7Xml);
        original.withVersion("7.24.0");
        expect(original.detectPlatformVersion()).toBe("7.20.0");
    });
});

describe("BpmnDocument.withExecutionPlatform", () => {
    it("should inject platform attributes with schema into the definitions tag", () => {
        const result = new BpmnDocument(xmlWithoutPlatform).withExecutionPlatform(
            "Camunda Platform",
            "7.20.0",
            `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`,
        );
        expect(result.xml).toEqual(xmlWithPlatform);
    });

    it("should work without a schema argument", () => {
        const result = new BpmnDocument(xmlWithoutPlatform).withExecutionPlatform(
            "Camunda Platform",
            "7.20.0",
        );
        expect(result.xml).toContain('modeler:executionPlatform="Camunda Platform"');
        expect(result.xml).toContain('modeler:executionPlatformVersion="7.20.0"');
    });

    it("should throw when the XML has no bpmn:definitions tag", () => {
        expect(() =>
            new BpmnDocument("<invalid/>").withExecutionPlatform("Camunda Platform", "7.20.0"),
        ).toThrow("The BPMN file does not contain a `bpmn:definitions` tag.");
    });

    it("should not mutate the original document", () => {
        const original = new BpmnDocument(xmlWithoutPlatform);
        original.withExecutionPlatform("Camunda Platform", "7.20.0");
        expect(original.xml).toBe(xmlWithoutPlatform);
    });
});

describe("BpmnDocument.extractProcessId", () => {
    it("should extract the process id", () => {
        expect(new BpmnDocument(c7Xml).extractProcessId()).toBe("Process_1aiafvx");
    });

    it("should throw when no bpmn:process element is found", () => {
        expect(() => new BpmnDocument(unknownXml).extractProcessId()).toThrow(
            "No <bpmn:process> element with an id attribute found in the BPMN file.",
        );
    });
});
