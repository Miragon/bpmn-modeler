/**
 * First-class domain value object for a BPMN XML document.
 *
 * Centralises all detection and manipulation operations so that raw
 * XML strings never need to be re-parsed at multiple call sites.
 * Instances are immutable: transformation methods return a new
 * `BpmnDocument` instead of mutating `this.xml`.
 */

import {
    DetectedEngine,
    detectEngine,
    Engine,
    ENGINE_EXECUTION_PLATFORM,
    ENGINE_LABEL,
    ExecutionPlatformAttributeNames,
    executionPlatformAttributeNames,
    MODELER_NAMESPACE_URI,
    readDefinitionsStartTag,
    readStartTag,
    XmlAttribute,
    XmlStartTag,
} from "@miragon/bpmn-modeler-types";

import { getLatestVersion } from "./engineVersions";
import { ExecutionPlatformNotDetectedError } from "./errors";
import { NewModelEngine } from "./newModelEngine";

export interface EngineVersionStatus {
    readonly platform: Engine;
    readonly version: string;
}

export type MigrationOutcome =
    | { readonly kind: "unchanged" }
    | { readonly kind: "versionReplaced"; readonly document: BpmnDocument }
    | { readonly kind: "platformStamped"; readonly document: BpmnDocument };

const BPMN_MODEL_NAMESPACE_URI = "http://www.omg.org/spec/BPMN/20100524/MODEL";

const ENGINE_NAMESPACE: Record<
    Engine,
    { readonly prefix: "camunda" | "zeebe"; readonly uri: string }
> = {
    c7: { prefix: "camunda", uri: "http://camunda.org/schema/1.0/bpmn" },
    c8: { prefix: "zeebe", uri: "http://camunda.org/schema/zeebe/1.0" },
};

const ENGINES_BY_DETECTION_PRIORITY: readonly Engine[] = ["c7", "c8"];

export class BpmnDocument {
    constructor(readonly xml: string) {}

    /**
     * Returns an empty BPMN diagram for the given engine and version — the
     * minimal structure bpmn-js needs to open and render a new diagram without
     * errors.
     */
    static empty(engine: Engine, version: string): BpmnDocument {
        if (engine === "c7") {
            return new BpmnDocument(`
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1d2hcmz" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.20.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="${version}">
  <bpmn:process id="Process_0gjrx3e" isExecutable="true" camunda:historyTimeToLive="180">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0gjrx3e">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`);
        }
        return new BpmnDocument(`
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1ksue5u" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.22.0" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="${version}">
  <bpmn:process id="Process_0vf1lkj" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0vf1lkj">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`);
    }

    /**
     * Returns an engine-neutral (untagged) empty diagram: no `modeler:*`
     * metadata, no exporter, no camunda/zeebe namespace, `isExecutable="false"`.
     * With no execution platform it opens in Design mode by the mode-marker
     * semantics — the scaffold for the new-model picker's "Engine-neutral" choice.
     */
    static emptyEngineNeutral(): BpmnDocument {
        return new BpmnDocument(`
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_neutral" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_neutral" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_neutral">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`);
    }

    /**
     * Scaffolds a new model for a {@link NewModelEngine} picker choice: an
     * engine-neutral diagram for `"neutral"`, or an execution-platform-stamped
     * empty diagram at the latest version for a concrete engine.
     */
    static forNewModel(choice: NewModelEngine): BpmnDocument {
        if (choice === "neutral") {
            return BpmnDocument.emptyEngineNeutral();
        }
        return BpmnDocument.empty(choice, getLatestVersion(choice));
    }

    /**
     * Returns `true` when the document holds no XML (new, unsaved file).
     */
    isEmpty(): boolean {
        return this.xml === "";
    }

    /**
     * Detects the Camunda execution platform from the XML, or `undefined` for
     * an engine-neutral (untagged) model — the caller owns the fallback policy.
     *
     * Delegates to the shared {@link detectEngine} helper for the spec-defined
     * `modeler:*` signals, then falls back to the engine namespace the
     * `definitions` root binds: the Camunda 7 one for C7, else the Zeebe one for C8.
     */
    detectEngine(): DetectedEngine {
        return detectEngine(this.xml) ?? engineOfNamespaceOnDefinitionsRoot(this.xml);
    }

    /**
     * Detects the Camunda execution platform, throwing when the model carries no
     * platform signal. Prefer {@link detectEngine} where an untagged model is a
     * valid, non-exceptional case.
     *
     * @throws {ExecutionPlatformNotDetectedError} When no platform signal is found.
     */
    detectPlatform(): Engine {
        const engine = this.detectEngine();
        if (!engine) {
            throw new ExecutionPlatformNotDetectedError();
        }
        return engine;
    }

    /**
     * The `x.y.z` execution-platform version on the `definitions` root, under the
     * prefix the root binds to the modeler namespace, or `undefined` when the root
     * carries none or another shape.
     */
    detectPlatformVersion(): string | undefined {
        const attributes = readDefinitionsStartTag(this.xml)?.attributes;
        if (!attributes) {
            return undefined;
        }
        const names = executionPlatformAttributeNames(attributes);
        return attributeNamed(attributes, names.version)?.value.match(/^\d+\.\d+\.\d+$/)?.[0];
    }

    /**
     * The platform and version the engine-version status shows, or `undefined`
     * when the document lacks either, so the status is hidden.
     */
    engineVersionStatus(): EngineVersionStatus | undefined {
        const platform = this.detectEngine();
        const version = this.detectPlatformVersion();
        return platform && version ? { platform, version } : undefined;
    }

    /**
     * Only a stamp adds the engine namespace: bpmn-js drops an unused one on
     * save, so requiring it on tagged diagrams would rewrite them on every run.
     *
     * @throws {Error} When the XML has no `definitions` root or is not a diagram for `engine`.
     */
    migratedTo(engine: Engine, version: string): MigrationOutcome {
        const definitions = readDefinitionsStartTag(this.xml);
        if (!definitions) {
            throw new Error("The BPMN file does not contain a `definitions` root element.");
        }
        if (this.detectEngine() !== engine) {
            throw new Error(`The diagram is not a ${ENGINE_LABEL[engine]} diagram.`);
        }

        const { attributes, attributesEnd } = definitions;
        const names = executionPlatformAttributeNames(attributes);
        const declaredVersion = attributeNamed(attributes, names.version);
        const isTagged =
            declaredVersion !== undefined &&
            attributeNamed(attributes, names.platform) !== undefined;
        if (isTagged && declaredVersion.value === version) {
            return { kind: "unchanged" };
        }

        const missingAttributes = isTagged
            ? []
            : platformAttributes(engine, names, version).filter(
                  ([name]) => attributeNamed(attributes, name) === undefined,
              );
        const xmlBeforeAppendedAttributes = declaredVersion
            ? this.xml.slice(0, declaredVersion.start) +
              `${names.version}="${version}"` +
              this.xml.slice(declaredVersion.end, attributesEnd)
            : this.xml.slice(0, attributesEnd);
        const document = new BpmnDocument(
            xmlBeforeAppendedAttributes +
                missingAttributes.map(([name, value]) => ` ${name}="${value}"`).join("") +
                this.xml.slice(attributesEnd),
        );
        return isTagged
            ? { kind: "versionReplaced", document }
            : { kind: "platformStamped", document };
    }

    /**
     * The id of the first executable process, or of the first process when none
     * is executable: Camunda deploys only executable processes.
     *
     * @throws {Error} When the diagram has no process with an id.
     */
    extractProcessId(): string {
        const processElementName = bpmnElementName(this.xml, "process");
        const processes = startTagsNamed(this.xml, processElementName).flatMap(({ attributes }) => {
            const id = attributeNamed(attributes, "id")?.value;
            const isExecutable = attributeNamed(attributes, "isExecutable")?.value === "true";
            return id ? [{ id, isExecutable }] : [];
        });
        const process = processes.find(({ isExecutable }) => isExecutable) ?? processes[0];
        if (process) {
            return process.id;
        }
        throw new Error(
            `No <${processElementName}> element with an id attribute found in the BPMN file.`,
        );
    }
}

/**
 * `localName` under the prefix the `definitions` root binds to the BPMN model
 * namespace, unprefixed for a default namespace, under `bpmn` without a binding.
 */
function bpmnElementName(xml: string, localName: string): string {
    for (const { name, value } of readDefinitionsStartTag(xml)?.attributes ?? []) {
        const [declaration, prefix] = name.split(":");
        if (declaration === "xmlns" && value === BPMN_MODEL_NAMESPACE_URI) {
            return prefix ? `${prefix}:${localName}` : localName;
        }
    }
    return `bpmn:${localName}`;
}

function engineOfNamespaceOnDefinitionsRoot(xml: string): DetectedEngine {
    const namespaceUris = (readDefinitionsStartTag(xml)?.attributes ?? [])
        .filter(({ name }) => name.startsWith("xmlns:"))
        .map(({ value }) => value);
    return ENGINES_BY_DETECTION_PRIORITY.find((engine) =>
        namespaceUris.includes(ENGINE_NAMESPACE[engine].uri),
    );
}

function startTagsNamed(xml: string, qualifiedName: string): XmlStartTag[] {
    const opening = `<${qualifiedName}`;
    const startTags: XmlStartTag[] = [];
    for (
        let tagStart = xml.indexOf(opening);
        tagStart !== -1;
        tagStart = xml.indexOf(opening, tagStart + 1)
    ) {
        const startTag = readStartTag(xml, tagStart);
        if (startTag?.name === qualifiedName) {
            startTags.push(startTag);
        }
    }
    return startTags;
}

function platformAttributes(
    engine: Engine,
    names: ExecutionPlatformAttributeNames,
    version: string,
): [name: string, value: string][] {
    const engineNamespace = ENGINE_NAMESPACE[engine];
    return [
        [`xmlns:${engineNamespace.prefix}`, engineNamespace.uri],
        [names.namespace, MODELER_NAMESPACE_URI],
        [names.platform, ENGINE_EXECUTION_PLATFORM[engine]],
        [names.version, version],
    ];
}

function attributeNamed(
    attributes: readonly XmlAttribute[],
    name: string,
): XmlAttribute | undefined {
    return attributes.find((attribute) => attribute.name === name);
}
