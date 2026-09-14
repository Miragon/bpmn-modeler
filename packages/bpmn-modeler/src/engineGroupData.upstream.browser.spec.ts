import Modeler from "bpmn-js/lib/Modeler";
import {
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    CamundaPlatformPropertiesProviderModule,
    ZeebePropertiesProviderModule,
} from "bpmn-js-properties-panel";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import zeebeModdle from "zeebe-bpmn-moddle/resources/zeebe.json";
import { afterEach, describe, expect, it } from "vitest";

import {
    ENGINE_APPENDED_ENTRY_IDS,
    ENGINE_REPLACED_GROUP_IDS,
    NEUTRAL_GROUP_IDS,
    hasEngineGroups,
} from "@miragon/bpmn-modeler-properties-panel/modeFilter/engineGroupData";

/**
 * Pins the hand-copied engine group/entry ids in engineGroupData.ts against the
 * installed bpmn-js-properties-panel providers, so a properties-panel bump that
 * shifts a group id or appends a new entry fails here instead of silently
 * degrading the design-mode filter. Runs in real Chromium: the jsdom project
 * cannot load bpmn-js (extensionless ESM imports break its web resolver).
 */

interface PropertiesEntry {
    id?: string;
}
interface PropertiesGroup {
    id: string;
    entries?: PropertiesEntry[];
    items?: unknown[];
}
interface PropertiesProvider {
    getGroups(element: unknown): (groups: PropertiesGroup[]) => PropertiesGroup[];
}

const NEUTRAL = new Set(NEUTRAL_GROUP_IDS);
const REPLACED = new Set(ENGINE_REPLACED_GROUP_IDS);

const ELEMENT_IDS = [
    "StartEvent_1",
    "ServiceTask_1",
    "SubProcess_1",
    "InnerTask_1",
    "Boundary_1",
    "EndEvent_1",
];

// One diagram covering the element types whose groups the design filter has to
// classify: engine chrome on tasks, the replaced timer/multiInstance groups,
// and the appended error/escalation entries.
function diagram(execPlatform: string, version: string, ext: "camunda" | "zeebe"): string {
    const ns =
        ext === "camunda"
            ? 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"'
            : 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:modeler="http://camunda.org/schema/modeler/1.0" ${ns}
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn"
  modeler:executionPlatform="${execPlatform}" modeler:executionPlatformVersion="${version}">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:timerEventDefinition id="Timer_1" />
    </bpmn:startEvent>
    <bpmn:serviceTask id="ServiceTask_1" name="Service" />
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:multiInstanceLoopCharacteristics />
      <bpmn:task id="InnerTask_1" />
    </bpmn:subProcess>
    <bpmn:boundaryEvent id="Boundary_1" attachedToRef="ServiceTask_1">
      <bpmn:errorEventDefinition id="Err_1" />
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:escalationEventDefinition id="Esc_1" />
    </bpmn:endEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D_1">
    <bpmndi:BPMNPlane id="P_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="150" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ServiceTask_1_di" bpmnElement="ServiceTask_1"><dc:Bounds x="240" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true"><dc:Bounds x="400" y="60" width="220" height="200" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1"><dc:Bounds x="430" y="120" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_1_di" bpmnElement="Boundary_1"><dc:Bounds x="290" y="142" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="700" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

interface EngineCase {
    name: string;
    engineModule: unknown;
    providerName: string;
    moddle: Record<string, unknown>;
    xml: string;
}

const CASES: EngineCase[] = [
    {
        name: "Camunda 7",
        engineModule: CamundaPlatformPropertiesProviderModule,
        providerName: "camundaPlatformPropertiesProvider",
        moddle: { camunda: camundaModdle as unknown as Record<string, unknown> },
        xml: diagram("Camunda Platform", "7.20.0", "camunda"),
    },
    {
        name: "Camunda 8",
        engineModule: ZeebePropertiesProviderModule,
        providerName: "zeebePropertiesProvider",
        moddle: { zeebe: zeebeModdle as unknown as Record<string, unknown> },
        xml: diagram("Camunda Cloud", "8.5.0", "zeebe"),
    },
];

let modeler: Modeler | undefined;
let container: HTMLElement | undefined;
let panelParent: HTMLElement | undefined;

afterEach(() => {
    modeler?.destroy();
    container?.remove();
    panelParent?.remove();
    modeler = undefined;
    container = undefined;
    panelParent = undefined;
});

async function collect(engineCase: EngineCase) {
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.appendChild(container);
    panelParent = document.createElement("div");
    document.body.appendChild(panelParent);

    modeler = new Modeler({
        container,
        additionalModules: [
            BpmnPropertiesPanelModule,
            BpmnPropertiesProviderModule,
            engineCase.engineModule,
        ],
        // @ts-expect-error moddleExtensions is a valid bpmn-js option absent from the type
        moddleExtensions: engineCase.moddle,
        propertiesPanel: { parent: panelParent },
    });
    await modeler.importXML(engineCase.xml);

    const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
    const base = modeler.get<PropertiesProvider>("bpmnPropertiesProvider");
    const engine = modeler.get<PropertiesProvider>(engineCase.providerName);

    return ELEMENT_IDS.map((id) => {
        const element = registry.get(id);
        const neutral = base.getGroups(element)([]);
        const full = engine.getGroups(element)(neutral.map((group) => ({ ...group })));
        return { neutral, full };
    });
}

describe("engineGroupData upstream pin", () => {
    it.each(CASES)("every engine group id $name contributes is recognised", async (engineCase) => {
        const perElement = await collect(engineCase);

        const unrecognised = new Set<string>();
        for (const { full } of perElement) {
            for (const group of full) {
                if (!group?.id) continue;
                if (NEUTRAL.has(group.id) || REPLACED.has(group.id)) continue;
                if (!hasEngineGroups([group.id])) unrecognised.add(group.id);
            }
        }

        expect(
            [...unrecognised],
            "engineGroupData.ts does not recognise these engine group ids — the " +
                "provider changed; update isEngineGroupId / BARE_ZEEBE_GROUP_IDS.",
        ).toEqual([]);
    });

    it.each(CASES)(
        "appended entries in kept neutral groups are listed ($name)",
        async (engineCase) => {
            const perElement = await collect(engineCase);

            const surprises: string[] = [];
            for (const { neutral, full } of perElement) {
                const neutralById = new Map(neutral.map((group) => [group.id, group]));
                for (const group of full) {
                    if (!group?.id || !NEUTRAL.has(group.id) || REPLACED.has(group.id)) continue;
                    const before = neutralById.get(group.id);
                    if (!before) continue;
                    const baseEntryIds = new Set((before.entries ?? []).map((entry) => entry.id));
                    const allowed = new Set(ENGINE_APPENDED_ENTRY_IDS[group.id] ?? []);
                    for (const entry of group.entries ?? []) {
                        if (entry.id && !baseEntryIds.has(entry.id) && !allowed.has(entry.id)) {
                            surprises.push(`${group.id}:${entry.id}`);
                        }
                    }
                }
            }

            expect(
                surprises,
                "engine provider appends entries not listed in ENGINE_APPENDED_ENTRY_IDS.",
            ).toEqual([]);
        },
    );

    it.each(CASES)(
        "every wholesale-replaced group id is still emitted by the engine ($name)",
        async (engineCase) => {
            const perElement = await collect(engineCase);

            // The design filter drops these neutral groups whenever an engine
            // provider ran, because the engine rebuilds them (same id, engine
            // components) and the neutral entries are not recoverable by
            // filtering. Entry-id equality can't see a component-level rebuild, so
            // the pin's job here is narrower but still catches an upstream rename:
            // each id must still appear in the engine output for some element.
            const emitted = new Set<string>();
            for (const { full } of perElement) {
                for (const id of ENGINE_REPLACED_GROUP_IDS) {
                    if (full.some((group) => group?.id === id)) emitted.add(id);
                }
            }

            expect(
                [...emitted].sort(),
                "an ENGINE_REPLACED_GROUP_IDS group id is no longer emitted — the " +
                    "provider renamed or dropped it; update ENGINE_REPLACED_GROUP_IDS.",
            ).toEqual([...ENGINE_REPLACED_GROUP_IDS].sort());
        },
    );
});
