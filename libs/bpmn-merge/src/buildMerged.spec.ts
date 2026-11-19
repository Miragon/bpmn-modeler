import {
    type ElementSnapshot,
    computeDiff,
    elementSnapshots,
    loadBpmnModdle,
} from "@miragon/bpmn-modeler-diff";
import { ENGINE_NAMESPACE } from "@miragon/bpmn-modeler-types/engine";
import { describe, expect, it } from "vitest";

import { baseModel, cloneModel, nodeById, removeNode } from "./__fixtures__/baseModel";
import { type BpmnFixtureModel, renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import {
    ALL_CONFLICTS_SCENARIO,
    MERGE_SCENARIOS,
    scenarioNamed,
} from "./__fixtures__/mergeScenarios";
import { handMergeVersions } from "./__fixtures__/handMergeVersions";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { acceptHandMerge } from "./acceptHandMerge";
import { type BuildNote, buildMerged } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import { MergeDecisions, type MergeResolution } from "./mergeDecisions";
import { isMergeElement } from "./mergeElements";
import type { MergeSide } from "./mergeResult";

async function decisionsFor(versions: MergeVersions): Promise<MergeDecisions> {
    return MergeDecisions.from(await computeMerge(versions));
}

/** Picks every element from `side`, retrying the blocked ones: a pick that would switch a dependent waits for it. */
async function everyElementFrom(versions: MergeVersions, side: MergeSide) {
    const decisions = await decisionsFor(versions);
    let pending = decisions.result.elements.map(({ id }) => id);
    for (let progress = true; pending.length > 0 && progress;) {
        const blocked = pending.filter((id) => !decisions.pick(id, side).applied);
        progress = blocked.length < pending.length;
        pending = blocked;
    }
    expect(pending, `picks from ${side}`).toEqual([]);
    return {
        ...(await buildMerged(await prepareMergeSources(versions), decisions)),
        resolution: decisions.resolution(),
    };
}

async function automaticMerge(versions: MergeVersions) {
    return buildMerged(await prepareMergeSources(versions), await decisionsFor(versions));
}

function snapshotsOf(xml: string, versions: MergeVersions) {
    const prefixSources = [versions.current, versions.incoming, versions.base].filter(
        (source): source is string => source !== undefined,
    );
    return elementSnapshots(xml, { prefixSources, isUnit: isMergeElement });
}

/** Everything a snapshot compares, so a root element or a derived reference that `computeDiff` misses still counts. */
function comparable({ content, parent, lanes, layout }: ElementSnapshot) {
    return { content, parent, lanes, layout };
}

async function expectSameElements(actual: string, expected: string, versions: MergeVersions) {
    const [actualSnapshots, expectedSnapshots] = await Promise.all([
        snapshotsOf(actual, versions),
        snapshotsOf(expected, versions),
    ]);
    expect([...actualSnapshots.keys()].sort()).toEqual([...expectedSnapshots.keys()].sort());
    for (const [id, snapshot] of expectedSnapshots) {
        expect(comparable(actualSnapshots.get(id)!), id).toEqual(comparable(snapshot));
    }
}

/** One root plane draws a collaboration and the processes it names, so it follows the side taken whole, not one owner's layout side. */
const ROOT_PLANE_OWNER_TYPES = new Set(["bpmn:Process", "bpmn:Collaboration"]);

/** computeDiff compares an unknown attribute by its prefix, so a prefix the result renames shows as a change. */
const RENAMED_PREFIX_ELEMENTS: Readonly<Record<string, readonly string[]>> = {
    "prefix collision": ["Task_Reject"],
};

/** The layout text without the plane, which a drawing apart from its container takes from that container. */
const withoutPlane = (layout: string | undefined) => layout?.replace(/"plane":"[^"]*",?/g, "");

/** Elements drawn from another side than their parent, which the sides draw differently: the parent's drawing decides their plane. */
function drawnApartFromParent(
    side: MergeSide,
    sides: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>,
    resolution: MergeResolution,
): ReadonlySet<string> {
    const layoutSide = (id: string) => resolution.layout[id] ?? side;
    return new Set(
        [...sides[side]].flatMap(([id, { parent }]) => {
            if (parent === undefined) return [];
            const drawnAlike =
                sides.current.get(parent)?.layout === sides.incoming.get(parent)?.layout;
            return drawnAlike || layoutSide(id) === layoutSide(parent) ? [] : [id];
        }),
    );
}

/** The elements whose drawing the build's layout repair changed, as its notes name them. */
function redrawnByTheBuild(notes: readonly BuildNote[]): ReadonlySet<string> {
    return new Set(
        notes.flatMap((note) => {
            if (!("repair" in note) || note.repair === "notRepaired") return [];
            switch (note.kind) {
                case "lanesOverlap":
                    return [note.moved, ...note.grown, ...note.shifted];
                case "shapesOverlap":
                    return note.repair === "madeRoom"
                        ? [note.moved, ...note.shifted]
                        : [note.moved];
                case "shapeOutsideContainer":
                    if (note.repair === "grewContainerAndShifted") {
                        return [note.id, ...note.shapes, ...note.shifted];
                    }
                    return note.repair === "grewContainer" ? [note.id, ...note.shapes] : [note.id];
                default:
                    return [note.id];
            }
        }),
    );
}

/**
 * Each element's content, parent and lanes as `side` wrote them, its drawing
 * from the side the layout rule names: a layout only the other side changed,
 * or both changed, is not an element decision. What the layout repair
 * redrew is checked by its own specs.
 */
async function expectEveryElementFrom(
    side: MergeSide,
    xml: string,
    scenario: MergeVersions & { readonly name: string },
    resolution: MergeResolution,
    notes: readonly BuildNote[],
) {
    const [merged, current, incoming] = await Promise.all([
        snapshotsOf(xml, scenario),
        snapshotsOf(scenario.current, scenario),
        snapshotsOf(scenario.incoming, scenario),
    ]);
    const sides = { current, incoming };
    const drawnApart = drawnApartFromParent(side, sides, resolution);
    const redrawn = redrawnByTheBuild(notes);
    expect([...merged.keys()].sort()).toEqual([...sides[side].keys()].sort());
    for (const [id, snapshot] of sides[side]) {
        const actual = merged.get(id)!;
        const layoutSide = ROOT_PLANE_OWNER_TYPES.has(snapshot.type)
            ? side
            : (resolution.layout[id] ?? side);
        const expectedLayout = redrawn.has(id) ? actual.layout : sides[layoutSide].get(id)?.layout;
        expect(
            drawnApart.has(id)
                ? { ...comparable(actual), layout: withoutPlane(actual.layout) }
                : comparable(actual),
            id,
        ).toEqual({
            ...comparable(snapshot),
            layout: drawnApart.has(id) ? withoutPlane(expectedLayout) : expectedLayout,
        });
    }
    const { added, removed, changed, layoutChanged } = await computeDiff(scenario[side], xml);
    expect({ added, removed, changed }).toEqual({
        added: [],
        removed: [],
        changed:
            RENAMED_PREFIX_ELEMENTS[scenario.name] && side === "incoming"
                ? RENAMED_PREFIX_ELEMENTS[scenario.name]
                : [],
    });
    const drawnFromTheOtherSide = Object.keys(resolution.layout).filter(
        (id) => resolution.layout[id] !== side || redrawn.has(id),
    );
    expect(drawnFromTheOtherSide).toEqual(expect.arrayContaining([...layoutChanged]));
}

function fixtureTriple(edits: {
    base?: (model: BpmnFixtureModel) => void;
    current?: (model: BpmnFixtureModel) => void;
    incoming?: (model: BpmnFixtureModel) => void;
}) {
    const base = baseModel("c7");
    edits.base?.(base);
    const side = (edit?: (model: BpmnFixtureModel) => void) => {
        const model = cloneModel(base);
        edit?.(model);
        return renderBpmn(model);
    };
    return { base: renderBpmn(base), current: side(edits.current), incoming: side(edits.incoming) };
}

async function declaredPrefixOf(xml: string, uri: string): Promise<string | undefined> {
    const { rootElement } = await (await loadBpmnModdle())().fromXML(xml);
    const declaration = Object.entries(rootElement.$attrs ?? {}).find(
        ([name, value]) => name.startsWith("xmlns:") && value === uri,
    );
    return declaration?.[0].slice("xmlns:".length);
}

const scenarios = MERGE_SCENARIOS.map((scenario) => ({ ...scenario }));

describe("buildMerged", () => {
    describe("taking one side whole", () => {
        it.each(scenarios)("$name: every element from current gives current", async (scenario) => {
            const { xml, notes, resolution } = await everyElementFrom(scenario, "current");

            await expectEveryElementFrom("current", xml, scenario, resolution, notes);
            if (Object.values(resolution.layout).every((side) => side === "current")) {
                expect(xml).toBe(scenario.current);
            }
            expect(
                notes.filter(
                    (note) => note.kind !== "frameDiffers" && note.kind !== "layoutChangedByBoth",
                ),
            ).toEqual([]);
        });

        it.each(scenarios)(
            "$name: every element from incoming gives incoming",
            async (scenario) => {
                const { xml, notes, resolution } = await everyElementFrom(scenario, "incoming");

                await parseWithoutWarnings(xml);
                await expectEveryElementFrom("incoming", xml, scenario, resolution, notes);
            },
        );
    });

    describe("independent changes", () => {
        it.each(["independent changes (c7)", "independent changes (c8)"])(
            "%s: the result holds both and each side differs only by the other's change",
            async (name) => {
                const scenario = scenarioNamed(name);
                const { xml } = await automaticMerge(scenario);
                const [merged, current, incoming] = await Promise.all([
                    snapshotsOf(xml, scenario),
                    snapshotsOf(scenario.current, scenario),
                    snapshotsOf(scenario.incoming, scenario),
                ]);

                for (const id of ["Task_Audit", "Flow_ToAudit", "Task_Reject"]) {
                    expect(comparable(merged.get(id)!), id).toEqual(comparable(current.get(id)!));
                }
                expect(comparable(merged.get("Task_Check")!)).toEqual(
                    comparable(incoming.get("Task_Check")!),
                );
                const againstCurrent = await computeDiff(scenario.current, xml);
                expect([
                    againstCurrent.added,
                    againstCurrent.removed,
                    againstCurrent.changed,
                ]).toEqual([[], [], ["Task_Check"]]);
                const againstIncoming = await computeDiff(scenario.incoming, xml);
                expect([
                    [...againstIncoming.added].sort(),
                    againstIncoming.removed,
                    againstIncoming.changed,
                ]).toEqual([["Flow_ToAudit", "Task_Audit"], [], []]);
            },
        );

        it("keeps the taken element's engine extensions as that side wrote them", async () => {
            const { xml } = await automaticMerge(scenarioNamed("independent changes (c7)"));

            expect(xml).toContain(
                '<camunda:executionListener class="com.example.Audit" event="start" />',
            );
            expect(xml).toContain('<camunda:inputParameter name="amount">');
        });
    });

    describe("namespaces", () => {
        it("keeps an unknown attribute of a taken element", async () => {
            const scenario = scenarioNamed("unknown namespaced attribute changed");
            const { xml } = await automaticMerge(scenario);

            expect(xml).toContain('custom:owner="shipping"');
            await expectSameElements(xml, scenario.incoming, scenario);
        });

        it("declares a namespace only incoming declares, used by an attribute alone", async () => {
            const { xml } = await automaticMerge(scenarioNamed("namespace only incoming declares"));

            expect(await declaredPrefixOf(xml, "urn:miragon:team")).toBe("team");
            expect(xml).toContain('team:owner="warehouse"');
        });

        it("keeps each attribute on its namespace when the sides use one prefix for two", async () => {
            const scenario = scenarioNamed("prefix collision");
            const { xml } = await automaticMerge(scenario);
            const parsed = await parseWithoutWarnings(xml);
            const currentPrefix = await declaredPrefixOf(xml, "urn:current:ext");
            const incomingPrefix = await declaredPrefixOf(xml, "urn:incoming:ext");

            expect(currentPrefix).toBe("ext");
            expect(incomingPrefix).toBeDefined();
            expect(incomingPrefix).not.toBe(currentPrefix);
            expect(parsed.elementsById.Task_Pack?.$attrs).toEqual({
                [`${currentPrefix}:tag`]: "current",
            });
            expect(parsed.elementsById.Task_Reject?.$attrs).toEqual({
                [`${incomingPrefix}:tag`]: "incoming",
            });
        });
    });

    describe("placement", () => {
        it("adds a root element only incoming has after the sibling it follows there", async () => {
            const scenario = scenarioNamed("root element only incoming adds");
            const { xml } = await automaticMerge(scenario);
            const parsed = await parseWithoutWarnings(xml);
            const rootIds = (parsed.rootElement.rootElements as { id: string }[]).map(
                ({ id }) => id,
            );

            expect(rootIds).toContain("Message_Reminder");
            const merged = await snapshotsOf(xml, scenario);
            expect(merged.get("Catch_Reminder")?.references).toContainEqual({
                property: "bpmn:MessageEventDefinition#messageRef",
                target: "Message_Reminder",
            });
        });

        it("moves a node into the lane incoming put it in", async () => {
            const scenario = scenarioNamed("moved into another lane");
            const { xml } = await automaticMerge(scenario);
            const merged = await snapshotsOf(xml, scenario);

            expect(merged.get("Task_Reject")?.lanes).toEqual(["Lane_Clerk"]);
            await expectSameElements(xml, scenario.incoming, scenario);
        });

        it("moves a node into the sub-process incoming put it in", async () => {
            const scenario = scenarioNamed("moved into a sub-process");
            const { xml } = await automaticMerge(scenario);
            const merged = await snapshotsOf(xml, scenario);

            expect(merged.get("Task_Label")?.parent).toBe("Sub_Ship");
            await expectSameElements(xml, scenario.incoming, scenario);
        });

        it("rebuilds the incoming and outgoing flows of a node whose flows come from both sides", async () => {
            const scenario = scenarioNamed("independent changes (c7)");
            const { xml } = await automaticMerge(scenario);
            const parsed = await parseWithoutWarnings(xml);
            const ids = (value: unknown) => (value as { id: string }[]).map(({ id }) => id);

            expect(ids(parsed.elementsById.Task_Reject?.outgoing)).toEqual([
                "Flow_Rejected",
                "Flow_ToAudit",
            ]);
            expect(ids(parsed.elementsById.Task_Audit?.incoming)).toEqual(["Flow_ToAudit"]);
        });

        it("keeps incoming's change to a data association without an id as a change of its task", async () => {
            const taskReadingFrom = (
                dataObjectReference: string,
            ) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:dataObjectReference id="Ref_A" dataObjectRef="DataObject_1" />
    <bpmn:dataObjectReference id="Ref_B" dataObjectRef="DataObject_1" />
    <bpmn:dataObject id="DataObject_1" />
    <bpmn:task id="Task_1">
      <bpmn:property id="Property_1" />
      <bpmn:dataInputAssociation>
        <bpmn:sourceRef>${dataObjectReference}</bpmn:sourceRef>
        <bpmn:targetRef>Property_1</bpmn:targetRef>
      </bpmn:dataInputAssociation>
    </bpmn:task>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
    <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="100" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Ref_A_di" bpmnElement="Ref_A"><dc:Bounds x="10" y="10" width="36" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Ref_B_di" bpmnElement="Ref_B"><dc:Bounds x="60" y="10" width="36" height="50" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
            const versions = {
                base: taskReadingFrom("Ref_A"),
                current: taskReadingFrom("Ref_A"),
                incoming: taskReadingFrom("Ref_B"),
            };

            const result = await computeMerge(versions);
            const { xml } = await automaticMerge(versions);

            expect(result.elements.find((element) => element.id === "Task_1")?.state).toBe(
                "takenFromIncoming",
            );
            expect(xml).toContain("<bpmn:sourceRef>Ref_B</bpmn:sourceRef>");
        });
    });

    describe("every scenario's automatic merge", () => {
        const buildable = scenarios.filter((scenario) => scenario.name !== ALL_CONFLICTS_SCENARIO);

        it.each(buildable)("$name: builds or names its open conflicts", async (scenario) => {
            const decisions = await decisionsFor(scenario);
            if (!decisions.canBuild) {
                await expect(
                    buildMerged(await prepareMergeSources(scenario), decisions),
                ).rejects.toThrow(decisions.openConflicts[0]!.id);
                return;
            }
            const { xml } = await buildMerged(await prepareMergeSources(scenario), decisions);
            await expect(parseWithoutWarnings(xml)).resolves.toBeDefined();
        });
    });

    describe("engines", () => {
        it("merges files that declare no engine with the plain BPMN descriptor", async () => {
            const withoutEngine = (model: BpmnFixtureModel) => {
                removeNode(model, "Task_Check");
                model.processAttributes = {};
            };
            const versions = {
                name: "no engine",
                ...fixtureTriple({
                    base: withoutEngine,
                    incoming: (model) => {
                        nodeById(model, "Task_Reject").name = "Reject order";
                    },
                }),
            };
            const { xml, notes, resolution } = await everyElementFrom(versions, "incoming");

            expect(xml).not.toContain(ENGINE_NAMESPACE.c7.uri);
            await expectEveryElementFrom("incoming", xml, versions, resolution, notes);
        });
    });

    describe("refusals", () => {
        it("throws on open conflicts and lists their ids", async () => {
            const scenario = scenarioNamed(ALL_CONFLICTS_SCENARIO);
            const decisions = await decisionsFor(scenario);
            const openIds = decisions.openConflicts.map(({ id }) => id);

            expect(openIds.length).toBeGreaterThan(1);
            await expect(
                buildMerged(await prepareMergeSources(scenario), decisions),
            ).rejects.toThrow(openIds.join(", "));
        });

        it("refuses a version with an unresolved reference, naming the version", async () => {
            const scenario = scenarioNamed("table: unchanged");
            const dangling = {
                ...scenario,
                current: scenario.current.replace('default="Flow_No"', 'default="Flow_Gone"'),
            };

            await expect(prepareMergeSources(dangling)).rejects.toThrow(
                /current does not parse: .*unresolved reference <Flow_Gone>/,
            );
        });

        it("refuses versions the decisions were not made for", async () => {
            const decisions = await decisionsFor(scenarioNamed("table: unchanged"));
            const other = scenarioNamed("root element only incoming adds");

            await expect(buildMerged(await prepareMergeSources(other), decisions)).rejects.toThrow(
                /^The merge decisions were made for other versions: .*incoming$/,
            );
        });

        it("refuses sources whose versions differ from the decisions' only in content, naming the side", async () => {
            const versions = fixtureTriple({
                incoming: (model) => {
                    nodeById(model, "Task_Check").name = "Check order carefully";
                },
            });
            const decisions = await decisionsFor(versions);
            const staleSources = await prepareMergeSources({
                ...versions,
                incoming: versions.base,
            });

            await expect(buildMerged(staleSources, decisions)).rejects.toThrow(
                "The merge decisions were made for other versions: incoming",
            );
        });

        it.each([
            {
                unknown: "an engine attribute",
                edit: (xml: string) =>
                    xml.replace('id="Task_Check"', 'id="Task_Check" camunda:notAProperty="x"'),
                named: /current does not parse: .*notAProperty/,
            },
            {
                unknown: "an engine extension element",
                edit: (xml: string) =>
                    xml.replace(
                        "<camunda:inputOutput>",
                        "<camunda:notInDescriptor /><camunda:inputOutput>",
                    ),
                named: /current does not parse: .*notInDescriptor/,
            },
        ])(
            "refuses a version whose engine descriptor does not know $unknown, naming the version",
            async ({ edit, named }) => {
                const versions = fixtureTriple({});

                await expect(
                    prepareMergeSources({ ...versions, current: edit(versions.current) }),
                ).rejects.toThrow(named);
            },
        );
    });

    describe("derived boundary event references", () => {
        const scenario = scenarioNamed("boundary event its host lists, removed by incoming");

        async function boundaryEventRefsOf(xml: string) {
            const parsed = await parseWithoutWarnings(xml);
            return (
                (parsed.elementsById.Task_Check?.boundaryEventRefs as
                    { id: string }[] | undefined) ?? []
            ).map(({ id }) => id);
        }

        it("drops a boundary event incoming removed from the host that lists it", async () => {
            const decisions = await decisionsFor(scenario);
            expect(decisions.canBuild).toBe(true);

            const { xml } = await buildMerged(await prepareMergeSources(scenario), decisions);

            expect(await boundaryEventRefsOf(xml)).toEqual([]);
        });

        it("keeps a listed boundary event the result keeps", async () => {
            const { xml } = await everyElementFrom(scenario, "current");

            expect(await boundaryEventRefsOf(xml)).toEqual(["Boundary_Timeout"]);
        });
    });

    describe("frame", () => {
        const scenario = scenarioNamed("table: unchanged");
        const withFrame = (xml: string, exporterVersion: string, team?: string) =>
            xml.replace(
                /exporterVersion="[^"]*"/,
                `exporterVersion="${exporterVersion}"${team === undefined ? "" : ` custom:team="${team}"`}`,
            );

        it("takes the definitions attributes only incoming changed", async () => {
            const versions = {
                ...scenario,
                incoming: withFrame(scenario.incoming, "9.9.9", "billing"),
            };
            const { xml, notes } = await automaticMerge(versions);

            expect(xml).toContain('exporterVersion="9.9.9"');
            expect(xml).toContain('custom:team="billing"');
            expect(notes).toEqual([]);
            await expectSameElements(xml, versions.incoming, versions);
        });

        it("keeps current's value of a definitions attribute both changed differently, naming it", async () => {
            const versions = {
                ...scenario,
                current: withFrame(scenario.current, "1.0.0"),
                incoming: withFrame(scenario.incoming, "9.9.9"),
            };
            const { xml, notes } = await automaticMerge(versions);

            expect(xml).toBe(versions.current);
            expect(notes).toEqual([{ kind: "frameDiffers", attribute: "exporterVersion" }]);
        });

        it("keeps current's definitions attributes without a base, naming those that differ", async () => {
            const versions = {
                current: scenario.current,
                incoming: withFrame(scenario.incoming, "9.9.9", "billing"),
            };
            const { xml, notes } = await automaticMerge(versions);

            expect(xml).toBe(versions.current);
            expect(notes).toEqual([
                { kind: "frameDiffers", attribute: "exporterVersion" },
                { kind: "frameDiffers", attribute: "custom:team" },
            ]);
        });

        it.each([
            {
                part: "extensionElements",
                added: `
  <bpmn:extensionElements>
    <custom:meta revision="2" />
  </bpmn:extensionElements>`,
            },
            {
                part: "imports",
                added: `
  <bpmn:import importType="http://www.w3.org/2001/XMLSchema" location="order.xsd" namespace="urn:order" />`,
            },
        ])("keeps current's $part and names incoming's change of them", async ({ part, added }) => {
            const opening = /<bpmn:definitions [^>]*>/.exec(scenario.incoming)![0];
            const versions = {
                ...scenario,
                incoming: scenario.incoming.replace(opening, `${opening}${added}`),
            };
            await expect(parseWithoutWarnings(versions.incoming)).resolves.toBeDefined();
            const { xml, notes } = await automaticMerge(versions);

            expect(xml).toBe(scenario.current);
            expect(notes).toEqual([{ kind: "frameDiffers", attribute: part }]);
        });
    });

    describe("diagrams", () => {
        async function diagramsOf(xml: string) {
            const { rootElement } = await parseWithoutWarnings(xml);
            return (
                rootElement.diagrams as {
                    id: string;
                    plane: {
                        bpmnElement: { id: string };
                        planeElement?: { bpmnElement: { id: string } }[];
                    };
                }[]
            ).map(({ id, plane }) => ({
                id,
                owner: plane.bpmnElement.id,
                drawn: (plane.planeElement ?? []).map(({ bpmnElement }) => bpmnElement.id),
            }));
        }

        const nodeIds = (xml: string) =>
            [...xml.matchAll(/<bpmndi:BPMN(?:Shape|Edge) id="[^"]*" bpmnElement="([^"]*)"/g)].map(
                ([, id]) => id!,
            );

        describe("no base: incoming wraps current's process in a pool, both root diagrams BPMNDiagram_1", () => {
            const scenario = scenarioNamed("no base: incoming wraps the process in a pool");

            it("takes incoming's pool onto one root diagram that draws every node", async () => {
                const { xml } = await everyElementFrom(scenario, "incoming");

                expect(await diagramsOf(xml)).toEqual([
                    {
                        id: "BPMNDiagram_1",
                        owner: "Collaboration_1",
                        drawn: expect.arrayContaining(nodeIds(scenario.incoming)),
                    },
                ]);
            });

            it("leaves the pool out on current's single root diagram", async () => {
                const { xml } = await everyElementFrom(scenario, "current");

                expect(xml).toBe(scenario.current);
            });

            it("draws current's process plane when the collaboration is kept without its pool", async () => {
                const decisions = await decisionsFor(scenario);
                expect(decisions.pick("Collaboration_1", "incoming").applied).toBe(true);
                expect(decisions.pick("Participant_Shop", "current").applied).toBe(true);
                const { xml } = await buildMerged(await prepareMergeSources(scenario), decisions);

                expect((await diagramsOf(xml)).map(({ owner }) => owner)).toEqual(["Process_1"]);
                expect(xml).toContain('<bpmn:collaboration id="Collaboration_1" />');
            });

            it("keeps the pool in when only the participant is taken from incoming", async () => {
                const decisions = await decisionsFor(scenario);
                for (const { id } of decisions.openConflicts) {
                    decisions.pick(id, "incoming");
                }
                const { xml } = await buildMerged(await prepareMergeSources(scenario), decisions);
                const [rootDiagram, ...others] = await diagramsOf(xml);

                expect(others).toEqual([]);
                expect(rootDiagram!.owner).toBe("Collaboration_1");
                expect([...rootDiagram!.drawn].sort()).toEqual(
                    [...nodeIds(scenario.incoming)].sort(),
                );
            });
        });

        describe("drawn parts of an element", () => {
            const DATA_INPUT = `
    <bpmn:ioSpecification id="IoSpecification_1">
      <bpmn:dataInput id="DataInput_Request" name="Request" />
      <bpmn:inputSet id="InputSet_1">
        <bpmn:dataInputRefs>DataInput_Request</bpmn:dataInputRefs>
      </bpmn:inputSet>
      <bpmn:outputSet id="OutputSet_1" />
    </bpmn:ioSpecification>`;
            const DATA_INPUT_SHAPE = `      <bpmndi:BPMNShape id="DataInput_Request_di" bpmnElement="DataInput_Request">
        <dc:Bounds x="160" y="480" width="36" height="50" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>`;
            const withProcessDataInput = (xml: string) =>
                xml
                    .replace(/(<bpmn:process id="Process_1"[^>]*>)/, `$1${DATA_INPUT}`)
                    .replace("    </bpmndi:BPMNPlane>", DATA_INPUT_SHAPE);
            const plain = renderBpmn(baseModel("c7"));

            it("keeps the shape of a process data input incoming adds", async () => {
                const versions = {
                    base: plain,
                    current: plain,
                    incoming: withProcessDataInput(plain),
                };
                const { xml } = await automaticMerge(versions);

                expect(xml).toContain('<bpmn:dataInput id="DataInput_Request"');
                expect(nodeIds(xml)).toContain("DataInput_Request");
            });

            it("drops the shape of a process data input incoming removes", async () => {
                const withDataInput = withProcessDataInput(plain);
                const versions = { base: withDataInput, current: withDataInput, incoming: plain };
                const { xml } = await automaticMerge(versions);

                expect(nodeIds(xml)).not.toContain("DataInput_Request");
            });

            it("takes the shape of a process data input with an incoming pick of its process", async () => {
                const versions = {
                    base: plain,
                    current: plain.replace(
                        'camunda:historyTimeToLive="180"',
                        'camunda:historyTimeToLive="90"',
                    ),
                    incoming: withProcessDataInput(plain),
                };
                const decisions = await decisionsFor(versions);
                expect(decisions.pick("Process_1", "incoming").applied).toBe(true);
                const { xml } = await buildMerged(await prepareMergeSources(versions), decisions);

                expect(nodeIds(xml)).toContain("DataInput_Request");
            });
        });

        describe("diagram interchange ids", () => {
            const base = renderBpmn(baseModel("c7"));
            const withTaskDrawnAs = (taskId: string, x: number, shapeId: string) => {
                const model = cloneModel(baseModel("c7"));
                model.nodes.push({
                    id: taskId,
                    type: "task",
                    name: taskId,
                    x,
                    y: 380,
                    lane: "Lane_Manager",
                });
                return renderBpmn(model).replace(`id="${taskId}_di"`, `id="${shapeId}"`);
            };

            it("draws both tasks the sides add when their shapes share an id, under unique ids", async () => {
                const versions = {
                    base,
                    current: withTaskDrawnAs("Task_A", 900, "BPMNShape_1"),
                    incoming: withTaskDrawnAs("Task_B", 1050, "BPMNShape_1"),
                };
                const { xml } = await automaticMerge(versions);
                const shapeIds = [...xml.matchAll(/<bpmndi:BPMNShape id="([^"]*)"/g)].map(
                    ([, id]) => id,
                );

                expect(nodeIds(xml)).toEqual(expect.arrayContaining(["Task_A", "Task_B"]));
                expect(new Set(shapeIds).size).toBe(shapeIds.length);
                expect(xml).toMatch(/<bpmndi:BPMNShape id="BPMNShape_1" bpmnElement="Task_A">/);
            });

            const withLabelStyle = (xml: string, taskId: string, font: string) =>
                xml
                    .replace(
                        new RegExp(
                            `(<bpmndi:BPMNShape id="${taskId}_di" bpmnElement="${taskId}">\\s*<dc:Bounds [^>]*/>)`,
                        ),
                        '$1\n        <bpmndi:BPMNLabel labelStyle="LabelStyle_1" />',
                    )
                    .replace(
                        "</bpmndi:BPMNPlane>",
                        `</bpmndi:BPMNPlane>\n    <bpmndi:BPMNLabelStyle id="LabelStyle_1"><dc:Font name="${font}" size="11" /></bpmndi:BPMNLabelStyle>`,
                    );

            it("carries over the label style a shape taken from incoming uses", async () => {
                const versions = {
                    base,
                    current: base,
                    incoming: withLabelStyle(
                        withTaskDrawnAs("Task_B", 1050, "Task_B_di"),
                        "Task_B",
                        "Arial",
                    ),
                };
                const { xml } = await automaticMerge(versions);

                expect(xml).toMatch(/<bpmndi:BPMNLabel labelStyle="LabelStyle_1" \/>/);
                expect(xml).toContain('<bpmndi:BPMNLabelStyle id="LabelStyle_1">');
            });

            it("renames incoming's label style when current holds another under its id", async () => {
                const versions = {
                    base,
                    current: withLabelStyle(
                        withTaskDrawnAs("Task_A", 900, "Task_A_di"),
                        "Task_A",
                        "Arial",
                    ),
                    incoming: withLabelStyle(
                        withTaskDrawnAs("Task_B", 1050, "Task_B_di"),
                        "Task_B",
                        "Courier",
                    ),
                };
                const { xml } = await automaticMerge(versions);
                const styleIds = [...xml.matchAll(/<bpmndi:BPMNLabelStyle id="([^"]*)"/g)].map(
                    ([, id]) => id,
                );

                expect(styleIds).toHaveLength(2);
                expect(new Set(styleIds).size).toBe(2);
                expect(xml).toContain('name="Courier"');
            });

            it("shares one label style both sides define alike", async () => {
                const versions = {
                    base,
                    current: withLabelStyle(
                        withTaskDrawnAs("Task_A", 900, "Task_A_di"),
                        "Task_A",
                        "Arial",
                    ),
                    incoming: withLabelStyle(
                        withTaskDrawnAs("Task_B", 1050, "Task_B_di"),
                        "Task_B",
                        "Arial",
                    ),
                };
                const { xml } = await automaticMerge(versions);

                expect([...xml.matchAll(/<bpmndi:BPMNLabelStyle /g)]).toHaveLength(1);
                expect([...xml.matchAll(/labelStyle="LabelStyle_1"/g)]).toHaveLength(2);
            });
        });

        describe("collapsed sub-processes", () => {
            it("draws a task current added inside a sub-process incoming collapsed on the sub-process's own plane", async () => {
                const scenario = scenarioNamed(
                    "collapse: current adds a task inside a sub-process incoming collapses",
                );
                const { xml } = await automaticMerge(scenario);
                const diagrams = await diagramsOf(xml);

                expect(diagrams.map(({ owner }) => owner)).toEqual(["Collaboration_1", "Sub_Ship"]);
                expect(diagrams[1]!.drawn).toContain("Task_Label");
                expect(diagrams[0]!.drawn).not.toContain("Task_Label");
            });

            it("draws the contents of a sub-process that stays expanded on its plane", async () => {
                const scenario = scenarioNamed(
                    "collapse: incoming collapses a sub-process current moves",
                );
                const { xml } = await automaticMerge(scenario);
                const diagrams = await diagramsOf(xml);

                expect(diagrams.map(({ owner }) => owner)).toEqual(["Collaboration_1"]);
                expect(diagrams[0]!.drawn).toEqual(
                    expect.arrayContaining(["Sub_Ship_Start", "Task_Pack", "Sub_Ship_End"]),
                );
            });
        });

        describe("flows", () => {
            /** As bpmn-js collapses `Sub_Ship`: a task-sized shape, its contents on a diagram of its own. */
            const collapseSubShip = (model: BpmnFixtureModel) => {
                Object.assign(nodeById(model, "Sub_Ship"), {
                    collapsed: true,
                    width: 100,
                    height: 80,
                });
                for (const id of ["Sub_Ship_Start", "Task_Pack", "Sub_Ship_End"]) {
                    nodeById(model, id).x -= 400;
                }
            };

            /** Closes every open conflict for `side`, as a user taking that side would. */
            async function conflictsClosedFor(versions: MergeVersions, side: MergeSide) {
                const decisions = await decisionsFor(versions);
                for (let [open] = decisions.openConflicts; open; [open] = decisions.openConflicts) {
                    expect(decisions.pick(open.id, side).applied, open.id).toBe(true);
                }
                return buildMerged(await prepareMergeSources(versions), decisions);
            }

            interface Flow {
                readonly $type: string;
                readonly sourceRef?: { id: string } | { id: string }[];
                readonly targetRef?: { id: string };
                readonly $parent: { id: string };
            }

            /** A data association runs into or out of the activity holding it. */
            const endsBpmnJsJoins = ({ $type, sourceRef, targetRef, $parent }: Flow) => {
                if ($type === "bpmn:DataInputAssociation") {
                    return [(sourceRef as { id: string }[])[0]?.id, $parent.id];
                }
                if ($type === "bpmn:DataOutputAssociation") return [$parent.id, targetRef?.id];
                return [(sourceRef as { id: string }).id, targetRef?.id];
            };

            async function planeOfEachFlow(xml: string) {
                const { rootElement } = await parseWithoutWarnings(xml);
                const planes = new Map<string, { owner: string; drawn: Set<string> }>();
                for (const { plane } of rootElement.diagrams as {
                    plane: {
                        bpmnElement: { id: string };
                        planeElement?: { $type: string; bpmnElement: { id: string } }[];
                    };
                }[]) {
                    const drawings = plane.planeElement ?? [];
                    const drawn = new Set(drawings.map(({ bpmnElement }) => bpmnElement.id));
                    for (const { $type, bpmnElement } of drawings) {
                        if ($type === "bpmndi:BPMNEdge") {
                            planes.set(bpmnElement.id, { owner: plane.bpmnElement.id, drawn });
                        }
                    }
                }
                return planes;
            }

            it("draws a data input one side adds to a sub-process the other collapses on the plane of its shape", async () => {
                const versions = fixtureTriple({
                    current: collapseSubShip,
                    incoming: (model) => {
                        model.flows.push({
                            id: "DataInput_Ship",
                            kind: "dataInput",
                            source: "DataRef_Order",
                            target: "Sub_Ship",
                        });
                    },
                });
                const { xml, notes } = await automaticMerge(versions);
                const plane = (await planeOfEachFlow(xml)).get("DataInput_Ship");

                expect(plane?.owner).toBe("Collaboration_1");
                expect([...plane!.drawn]).toEqual(
                    expect.arrayContaining(["DataRef_Order", "Sub_Ship"]),
                );
                expect(notes.filter(({ kind }) => kind === "flowNotDrawn")).toEqual([]);
            });

            it("draws an association to a flow on the plane of that flow", async () => {
                const versions = fixtureTriple({
                    current: collapseSubShip,
                    incoming: (model) => {
                        model.flows.push({
                            id: "Association_Flow",
                            kind: "association",
                            source: "Note_Check",
                            target: "Flow_Checked",
                        });
                    },
                });
                const { xml, notes } = await automaticMerge(versions);

                expect((await planeOfEachFlow(xml)).get("Association_Flow")?.owner).toBe(
                    "Collaboration_1",
                );
                expect(notes.filter(({ kind }) => kind === "flowNotDrawn")).toEqual([]);
            });

            describe("both sides add a task under one id, one of them inside a sub-process it collapses", () => {
                const versions = fixtureTriple({
                    current: (model) => {
                        collapseSubShip(model);
                        model.nodes.push({
                            id: "Task_N2",
                            type: "task",
                            name: "New",
                            x: 250,
                            y: 242,
                            parent: "Sub_Ship",
                        });
                        model.flows.push({
                            id: "Flow_N3",
                            source: "Sub_Ship_Start",
                            target: "Task_N2",
                        });
                    },
                    incoming: (model) => {
                        model.nodes.push({
                            id: "Task_N2",
                            type: "task",
                            name: "Between",
                            x: 872,
                            y: 232,
                            lane: "Lane_Clerk",
                        });
                        model.flows.find(({ id }) => id === "Flow_Shipped")!.target = "Task_N2";
                        model.flows.push({ id: "Flow_N1", source: "Task_N2", target: "End_Done" });
                    },
                });

                it.each<[MergeSide, readonly string[]]>([
                    ["current", ["Flow_Shipped", "Flow_N1"]],
                    ["incoming", ["Flow_N3"]],
                ])(
                    "draws no flow on a plane without both its ends when the clash goes to %s, and names the flows it leaves out",
                    async (side, leftOut) => {
                        const { xml, notes } = await conflictsClosedFor(versions, side);
                        const planes = await planeOfEachFlow(xml);
                        const { elementsById } = await parseWithoutWarnings(xml);
                        const endsOffPlane = [...planes]
                            .filter(([id, { drawn }]) => {
                                const ends = endsBpmnJsJoins(elementsById[id] as unknown as Flow);
                                return ends.some((end) => !drawn.has(end ?? ""));
                            })
                            .map(([id]) => id);

                        expect(endsOffPlane).toEqual([]);
                        expect(leftOut.filter((id) => planes.has(id))).toEqual([]);
                        expect(
                            notes
                                .filter(({ kind }) => kind === "flowNotDrawn")
                                .map((note) => ("id" in note ? note.id : undefined)),
                        ).toEqual(leftOut);
                    },
                );
            });
        });
    });

    describe("a task and the flow that ends at it", () => {
        const gatewayToTask = (
            task: { name: string } | undefined,
            flow: { condition?: string; listener?: string } = {},
        ) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="180">
${
    task === undefined
        ? `    <bpmn:exclusiveGateway id="G" />`
        : `    <bpmn:exclusiveGateway id="G"><bpmn:outgoing>F</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="T" name="${task.name}"><bpmn:incoming>F</bpmn:incoming></bpmn:task>
    <bpmn:sequenceFlow id="F" sourceRef="G" targetRef="T">${
        flow.listener === undefined
            ? ""
            : `<bpmn:extensionElements><camunda:executionListener class="${flow.listener}" event="take" /></bpmn:extensionElements>`
    }${
        flow.condition === undefined
            ? ""
            : `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${flow.condition}</bpmn:conditionExpression>`
    }</bpmn:sequenceFlow>`
}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="G_di" bpmnElement="G"><dc:Bounds x="100" y="100" width="50" height="50" /></bpmndi:BPMNShape>${
          task === undefined
              ? ""
              : `
      <bpmndi:BPMNShape id="T_di" bpmnElement="T"><dc:Bounds x="250" y="85" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F_di" bpmnElement="F"><di:waypoint x="150" y="125" /><di:waypoint x="250" y="125" /></bpmndi:BPMNEdge>`
      }
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

        it("holds current's task rename and incoming's condition and listener on its flow", async () => {
            const { xml } = await automaticMerge({
                base: gatewayToTask({ name: "Check" }),
                current: gatewayToTask({ name: "Check order" }),
                incoming: gatewayToTask(
                    { name: "Check" },
                    { condition: "${ok}", listener: "com.example.Audit" },
                ),
            });

            await parseWithoutWarnings(xml);
            expect(xml).toContain('name="Check order"');
            expect(xml).toContain(
                '<camunda:executionListener class="com.example.Audit" event="take" />',
            );
            expect(xml).toContain(
                '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${ok}</bpmn:conditionExpression>',
            );
        });

        it("keeps the flow incoming changed with the task current removed, and lists it on both ends", async () => {
            const versions = {
                base: gatewayToTask({ name: "Check" }, { condition: "${a}" }),
                current: gatewayToTask(undefined),
                incoming: gatewayToTask({ name: "Check" }, { condition: "${c}" }),
            };
            const decisions = await decisionsFor(versions);
            decisions.pick("F", "incoming");

            const { xml } = await buildMerged(await prepareMergeSources(versions), decisions);

            await parseWithoutWarnings(xml);
            expect(xml).toMatch(
                /<bpmn:exclusiveGateway id="G">\s*<bpmn:outgoing>F<\/bpmn:outgoing>/,
            );
            expect(xml).toMatch(
                /<bpmn:task id="T" name="Check">\s*<bpmn:incoming>F<\/bpmn:incoming>/,
            );
            expect(xml).toContain("${c}");
        });

        it("leaves out the flow, and the gateway lists nothing, when the task is picked away", async () => {
            const versions = {
                base: gatewayToTask({ name: "Check" }, { condition: "${a}" }),
                current: gatewayToTask(undefined),
                incoming: gatewayToTask({ name: "Check" }, { condition: "${c}" }),
            };
            const decisions = await decisionsFor(versions);
            decisions.pick("T", "current");

            const { xml } = await buildMerged(await prepareMergeSources(versions), decisions);

            await parseWithoutWarnings(xml);
            expect(xml).not.toContain('id="F"');
            expect(xml).toMatch(/<bpmn:exclusiveGateway id="G" \/>/);
        });
    });

    describe("notes", () => {
        it("names and re-routes a flow whose end the other side moved away from it", async () => {
            const versions = fixtureTriple({
                current: (model) => {
                    nodeById(model, "Task_Check").y += 30;
                },
                incoming: (model) => {
                    nodeById(model, "Gateway_Ok").y += 30;
                },
            });
            const { notes } = await automaticMerge(versions);

            expect(notes).toEqual([
                {
                    kind: "flowEndOffShape",
                    id: "Flow_Checked",
                    shapes: ["Gateway_Ok"],
                    repair: "movedByBuild",
                },
            ]);
        });

        it("names a task kept against current's removal whose flows current removed with it stay out", async () => {
            const scenario = scenarioNamed(
                "dangling: current removes a task, incoming adds a flow from it",
            );
            const decisions = await decisionsFor(scenario);
            expect(decisions.pick("Task_Reject", "incoming").applied).toBe(true);

            const { notes } = await buildMerged(await prepareMergeSources(scenario), decisions);

            const restored = notes.filter((note) => note.kind === "restoredWithoutRemovedWith");
            expect(restored).toHaveLength(1);
            expect(restored[0]).toMatchObject({ id: "Task_Reject" });
            expect(restored[0]).toHaveProperty(
                "connections",
                expect.arrayContaining(["Flow_No", "Flow_Rejected"]),
            );
        });

        it("keeps a task with the flows current removed with it and notes none of them", async () => {
            const scenario = scenarioNamed(
                "dangling: current removes a task, incoming adds a flow from it",
            );
            const decisions = await decisionsFor(scenario);
            expect(decisions.pickWithRemoved("Task_Reject", "incoming").applied).toBe(true);

            const { xml, notes } = await buildMerged(
                await prepareMergeSources(scenario),
                decisions,
            );

            const { elementsById } = await parseWithoutWarnings(xml);
            for (const id of ["Task_Reject", "Flow_No", "Flow_Rejected", "Flow_Timeout"]) {
                expect(elementsById, id).toHaveProperty(id);
            }
            expect(notes.filter((note) => note.kind === "restoredWithoutRemovedWith")).toEqual([]);
        });

        it("keeps the gateway's default with the default flow current removed", async () => {
            const scenario = scenarioNamed(
                "dangling: current removes a task, incoming adds a flow from it",
            );
            const decisions = await decisionsFor(scenario);
            expect(decisions.sideOf("Gateway_Ok")).toBe("current");
            expect(decisions.pickWithRemoved("Task_Reject", "incoming").applied).toBe(true);

            const { xml, notes } = await buildMerged(
                await prepareMergeSources(scenario),
                decisions,
            );

            const { elementsById } = await parseWithoutWarnings(xml);
            expect(elementsById.Gateway_Ok).toHaveProperty("default.id", "Flow_No");
            expect(notes.filter((note) => note.kind === "defaultFlowNotRestored")).toEqual([]);
        });

        it("keeps the default current set instead of the restored flow and names both", async () => {
            const versions = fixtureTriple({
                current: (model) => {
                    removeNode(model, "Task_Reject");
                    nodeById(model, "Gateway_Ok").default = "Flow_Yes";
                },
            });
            const decisions = await decisionsFor(versions);
            expect(decisions.pickWithRemoved("Task_Reject", "incoming").applied).toBe(true);

            const { xml, notes } = await buildMerged(
                await prepareMergeSources(versions),
                decisions,
            );

            const { elementsById } = await parseWithoutWarnings(xml);
            expect(elementsById, "Flow_No").toHaveProperty("Flow_No");
            expect(elementsById.Gateway_Ok).toHaveProperty("default.id", "Flow_Yes");
            expect(notes).toContainEqual({
                kind: "defaultFlowNotRestored",
                id: "Gateway_Ok",
                flow: "Flow_No",
                keptDefault: "Flow_Yes",
            });
        });

        it("names the default a source of a type without one cannot take back", async () => {
            const versions = fixtureTriple({
                current: (model) => {
                    removeNode(model, "Task_Reject");
                    nodeById(model, "Gateway_Ok").type = "parallelGateway";
                },
            });
            const decisions = await decisionsFor(versions);
            expect(decisions.pickWithRemoved("Task_Reject", "incoming").applied).toBe(true);

            const { xml, notes } = await buildMerged(
                await prepareMergeSources(versions),
                decisions,
            );

            const { elementsById } = await parseWithoutWarnings(xml);
            expect(elementsById.Gateway_Ok).toHaveProperty("$type", "bpmn:ParallelGateway");
            expect(elementsById.Gateway_Ok).not.toHaveProperty("default");
            expect(notes).toContainEqual({
                kind: "defaultFlowNotRestored",
                id: "Gateway_Ok",
                flow: "Flow_No",
            });
        });

        it("moves one of two shapes both sides added at the same place and names it", async () => {
            const addTask = (id: string, x: number) => (model: BpmnFixtureModel) => {
                model.nodes.push({ id, type: "task", name: id, x, y: 320, lane: "Lane_Manager" });
            };
            const versions = fixtureTriple({
                current: addTask("Task_Here", 1000),
                incoming: addTask("Task_There", 1030),
            });
            const { notes } = await automaticMerge(versions);

            expect(notes).toEqual([
                {
                    kind: "shapesOverlap",
                    ids: ["Task_There", "Task_Here"],
                    repair: "movedByBuild",
                    moved: "Task_Here",
                },
            ]);
        });

        it("names an element both sides moved differently and the side whose layout it keeps", async () => {
            const { notes } = await automaticMerge(scenarioNamed("both moved differently"));

            expect(notes).toEqual([
                { kind: "layoutChangedByBoth", ids: ["Task_Reject"], keptSide: "current" },
            ]);
        });

        it("notes nothing for an element both sides moved alike", async () => {
            const { notes } = await automaticMerge(scenarioNamed("both moved the same way"));

            expect(notes).toEqual([]);
        });

        it("names a frame attribute the sides changed differently and keeps current's", async () => {
            const scenario = scenarioNamed("table: unchanged");
            const platformVersion = (xml: string, version: string) =>
                xml.replace(
                    /modeler:executionPlatformVersion="[^"]*"/,
                    `modeler:executionPlatformVersion="${version}"`,
                );
            const versions = {
                ...scenario,
                current: platformVersion(scenario.current, "7.24.0"),
                incoming: platformVersion(scenario.incoming, "7.99.0"),
            };
            const { xml, notes } = await automaticMerge(versions);

            expect(notes).toEqual([
                { kind: "frameDiffers", attribute: "modeler:executionPlatformVersion" },
            ]);
            expect(xml).toBe(versions.current);
        });
    });
});

describe("buildMerged with versions merged by hand", () => {
    const BOTH_CHANGED = ["Start_Order", "Task_Check", "Sub_Ship", "Task_Pack", "Flow_Yes"];

    async function pickedOnCurrent() {
        const versions = handMergeVersions();
        const sources = await prepareMergeSources(versions);
        const decisions = await decisionsFor(versions);
        for (const id of BOTH_CHANGED) decisions.pick(id, "current");
        const plain = await buildMerged(sources, decisions);
        const textOf = (id: string) => sources.handMergeTexts.get(id)!.current;
        return { sources, decisions, plain, textOf };
    }

    it("keeps a sub-process merged by hand with its children and its shape", async () => {
        const { sources, decisions, plain, textOf } = await pickedOnCurrent();
        const merged = textOf("Sub_Ship").replace('name="Ship now"', 'name="Ship soon"');
        expect(await acceptHandMerge(sources, decisions, "Sub_Ship", "current", merged)).toEqual({
            applied: true,
        });

        const { xml } = await buildMerged(sources, decisions);

        expect(xml).toBe(plain.xml.replace('name="Ship now"', 'name="Ship soon"'));
        const parsed = await parseWithoutWarnings(xml);
        const subProcess = parsed.elementsById["Sub_Ship"]!;
        expect((subProcess.flowElements as { id: string }[]).map(({ id }) => id)).toEqual([
            "Sub_Ship_Start",
            "Task_Pack",
            "Sub_Ship_End",
            "Flow_Ship_1",
            "Flow_Ship_2",
        ]);
    });

    it("declares no namespace on an element merged by hand", async () => {
        const { sources, decisions, textOf } = await pickedOnCurrent();
        const merged = textOf("Task_Check").replace(
            'custom:owner="billing"',
            'custom:owner="sales"',
        );
        expect(merged).toMatch(/^<bpmn:serviceTask xmlns:camunda=/);
        expect(await acceptHandMerge(sources, decisions, "Task_Check", "current", merged)).toEqual({
            applied: true,
        });

        const { xml } = await buildMerged(sources, decisions);

        const startTag = xml.match(/<bpmn:serviceTask [^>]*>/)![0];
        expect(startTag).toContain('custom:owner="sales"');
        expect(startTag).not.toContain("xmlns");
    });

    it("builds a hand merge naming a part another hand merge adds", async () => {
        const { sources, decisions, textOf } = await pickedOnCurrent();
        const withProperty = textOf("Task_Check").replace(
            '  <bpmn:property id="Property_Check"',
            '  <bpmn:property id="Property_New" />\n  <bpmn:property id="Property_Check"',
        );
        const loopingOverIt = textOf("Task_Pack").replace(
            " />",
            ">\n  <bpmn:multiInstanceLoopCharacteristics>\n" +
                "    <bpmn:loopDataInputRef>Property_New</bpmn:loopDataInputRef>\n" +
                "  </bpmn:multiInstanceLoopCharacteristics>\n</bpmn:userTask>",
        );
        expect(withProperty).toContain("Property_New");
        expect(
            await acceptHandMerge(sources, decisions, "Task_Check", "current", withProperty),
        ).toEqual({ applied: true });
        expect(
            await acceptHandMerge(sources, decisions, "Task_Pack", "current", loopingOverIt),
        ).toEqual({ applied: true });

        const { xml } = await buildMerged(sources, decisions);

        expect(xml).toContain('<bpmn:property id="Property_New" />');
        expect(xml).toContain("<bpmn:loopDataInputRef>Property_New</bpmn:loopDataInputRef>");
    });
});
