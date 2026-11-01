import { describe, expect, it } from "vitest";

import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import {
    enginesIn,
    MigrationCandidate,
    MigrationPlan,
    MigrationVersions,
    PlannedWrite,
} from "./MigrationPlan";

const diagram = (...rootAttributes: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${rootAttributes.join(" ")}>
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const CAMUNDA_NAMESPACE = 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"';
const ZEEBE_NAMESPACE = 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
const MODELER_NAMESPACE = 'xmlns:modeler="http://camunda.org/schema/modeler/1.0"';
const C7_PLATFORM = 'modeler:executionPlatform="Camunda Platform"';
const C8_PLATFORM = 'modeler:executionPlatform="Camunda Cloud"';
const platformVersion = (version: string) => `modeler:executionPlatformVersion="${version}"`;

const taggedC7 = (version: string) =>
    diagram(CAMUNDA_NAMESPACE, MODELER_NAMESPACE, C7_PLATFORM, platformVersion(version));
const taggedC8 = (version: string) =>
    diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE, C8_PLATFORM, platformVersion(version));
const c7NamespaceOnly = diagram(CAMUNDA_NAMESPACE);
const c8NamespaceOnly = diagram(ZEEBE_NAMESPACE, MODELER_NAMESPACE);
const c8PlatformNameOnly = diagram(MODELER_NAMESPACE, C8_PLATFORM);
const untagged = diagram(MODELER_NAMESPACE);
const notADiagramMentioningZeebe = `<!-- ${ZEEBE_NAMESPACE} -->`;

const BOTH_VERSIONS: MigrationVersions = { c7: "7.24.0", c8: "8.8.0" };

const candidate = (path: string, xml: string): MigrationCandidate => ({
    path,
    document: new BpmnDocument(xml),
});

const planOf = (...candidates: MigrationCandidate[]) => MigrationPlan.classify(candidates);

const plannedEngines = (plan: MigrationPlan) =>
    plan.writesFor(BOTH_VERSIONS).map(({ path, engine }) => ({ path, engine }));

describe("MigrationPlan.classify", () => {
    it.each([
        { diagram: "a tagged C7 diagram", xml: taggedC7("7.20.0"), engine: "c7" },
        { diagram: "a tagged C8 diagram", xml: taggedC8("8.5.0"), engine: "c8" },
        { diagram: "a C7 diagram known only by its namespace", xml: c7NamespaceOnly, engine: "c7" },
        { diagram: "a C8 diagram known only by its namespace", xml: c8NamespaceOnly, engine: "c8" },
        {
            diagram: "a C8 diagram known by its platform name",
            xml: c8PlatformNameOnly,
            engine: "c8",
        },
    ])("plans $diagram for $engine", ({ xml, engine }) => {
        const plan = planOf(candidate("/work/a.bpmn", xml));

        expect(plannedEngines(plan)).toEqual([{ path: "/work/a.bpmn", engine }]);
        expect(plan.undetected).toEqual([]);
    });

    it.each([
        { diagram: "a diagram without an execution platform", xml: untagged },
        { diagram: "an empty document", xml: "" },
        {
            diagram: "a file that only mentions an engine namespace",
            xml: notADiagramMentioningZeebe,
        },
    ])("leaves $diagram undetected", ({ xml }) => {
        const plan = planOf(candidate("/work/a.bpmn", xml));

        expect(plannedEngines(plan)).toEqual([]);
        expect(plan.undetected).toEqual(["/work/a.bpmn"]);
    });

    it("puts every candidate in exactly one group and keeps the input order within each", () => {
        const plan = planOf(
            candidate("/work/c8-first.bpmn", taggedC8("8.5.0")),
            candidate("/work/unknown-first.bpmn", untagged),
            candidate("/work/c7-first.bpmn", taggedC7("7.20.0")),
            candidate("/work/c8-second.bpmn", c8NamespaceOnly),
            candidate("/work/unknown-second.bpmn", ""),
            candidate("/work/c7-second.bpmn", c7NamespaceOnly),
        );

        expect(plannedEngines(plan)).toEqual([
            { path: "/work/c7-first.bpmn", engine: "c7" },
            { path: "/work/c7-second.bpmn", engine: "c7" },
            { path: "/work/c8-first.bpmn", engine: "c8" },
            { path: "/work/c8-second.bpmn", engine: "c8" },
        ]);
        expect(plan.undetected).toEqual(["/work/unknown-first.bpmn", "/work/unknown-second.bpmn"]);
    });
});

describe("MigrationPlan.scopeDecision", () => {
    it.each([
        {
            workspace: "only C7 diagrams",
            candidates: [candidate("/work/a.bpmn", taggedC7("7.20.0"))],
            expected: { kind: "fixed", scope: "c7" },
        },
        {
            workspace: "only C8 diagrams",
            candidates: [candidate("/work/a.bpmn", taggedC8("8.5.0"))],
            expected: { kind: "fixed", scope: "c8" },
        },
        {
            workspace: "C7 diagrams next to undetected ones",
            candidates: [
                candidate("/work/a.bpmn", untagged),
                candidate("/work/b.bpmn", c7NamespaceOnly),
            ],
            expected: { kind: "fixed", scope: "c7" },
        },
        {
            workspace: "C7 diagrams next to a file that only mentions the C8 namespace",
            candidates: [
                candidate("/work/a.bpmn", taggedC7("7.20.0")),
                candidate("/work/notes.bpmn", notADiagramMentioningZeebe),
            ],
            expected: { kind: "fixed", scope: "c7" },
        },
        {
            workspace: "diagrams of both engines",
            candidates: [
                candidate("/work/a.bpmn", taggedC8("8.5.0")),
                candidate("/work/b.bpmn", taggedC7("7.20.0")),
                candidate("/work/c.bpmn", c8NamespaceOnly),
            ],
            expected: { kind: "ask", c7Count: 1, c8Count: 2 },
        },
        {
            workspace: "only undetected diagrams",
            candidates: [candidate("/work/a.bpmn", untagged)],
            expected: { kind: "nothingToMigrate" },
        },
        { workspace: "no diagrams", candidates: [], expected: { kind: "nothingToMigrate" } },
    ])("decides the scope for $workspace", ({ candidates, expected }) => {
        expect(planOf(...candidates).scopeDecision()).toEqual(expected);
    });
});

describe("enginesIn", () => {
    it.each([
        { scope: "c7", expected: ["c7"] },
        { scope: "c8", expected: ["c8"] },
        { scope: "both", expected: ["c7", "c8"] },
    ] as const)("asks for a version of each engine in scope $scope", ({ scope, expected }) => {
        expect(enginesIn(scope)).toEqual(expected);
    });
});

describe("MigrationPlan.writesFor", () => {
    const plan = planOf(
        candidate("/work/c8-a.bpmn", taggedC8("8.5.0")),
        candidate("/work/c7.bpmn", taggedC7("7.20.0")),
        candidate("/work/c8-b.bpmn", taggedC8("8.8.0")),
        candidate("/work/unknown.bpmn", untagged),
    );

    it.each([
        {
            versions: { c8: "8.8.0" },
            expected: [
                { path: "/work/c8-a.bpmn", engine: "c8", version: "8.8.0" },
                { path: "/work/c8-b.bpmn", engine: "c8", version: "8.8.0" },
            ],
        },
        {
            versions: { c7: "7.24.0" },
            expected: [{ path: "/work/c7.bpmn", engine: "c7", version: "7.24.0" }],
        },
        {
            versions: BOTH_VERSIONS,
            expected: [
                { path: "/work/c7.bpmn", engine: "c7", version: "7.24.0" },
                { path: "/work/c8-a.bpmn", engine: "c8", version: "8.8.0" },
                { path: "/work/c8-b.bpmn", engine: "c8", version: "8.8.0" },
            ],
        },
        { versions: {}, expected: [] },
    ])("plans the diagrams of each engine picked in $versions", ({ versions, expected }) => {
        expect(plan.writesFor(versions)).toEqual(expected);
    });
});

describe("PlannedWrite.writeFrom", () => {
    it.each([
        {
            current: "a C8 diagram at an older version",
            planned: new PlannedWrite("/work/a.bpmn", "c8", "8.8.0"),
            xml: taggedC8("8.5.0"),
            expected: { kind: "write", xml: taggedC8("8.8.0"), stampedPlatform: false },
        },
        {
            current: "a C7 diagram at an older version",
            planned: new PlannedWrite("/work/a.bpmn", "c7", "7.24.0"),
            xml: taggedC7("7.20.0"),
            expected: { kind: "write", xml: taggedC7("7.24.0"), stampedPlatform: false },
        },
        {
            current: "a C8 diagram without a version",
            planned: new PlannedWrite("/work/a.bpmn", "c8", "8.8.0"),
            xml: c8NamespaceOnly,
            expected: {
                kind: "write",
                xml: diagram(
                    ZEEBE_NAMESPACE,
                    MODELER_NAMESPACE,
                    C8_PLATFORM,
                    platformVersion("8.8.0"),
                ),
                stampedPlatform: true,
            },
        },
        {
            current: "a C8 diagram already at the version",
            planned: new PlannedWrite("/work/a.bpmn", "c8", "8.8.0"),
            xml: taggedC8("8.8.0"),
            expected: { kind: "unchanged" },
        },
        {
            current: "a diagram that became a C7 diagram",
            planned: new PlannedWrite("/work/a.bpmn", "c8", "8.8.0"),
            xml: taggedC7("7.20.0"),
            expected: { kind: "engineChanged" },
        },
        {
            current: "a diagram that lost its execution platform",
            planned: new PlannedWrite("/work/a.bpmn", "c7", "7.24.0"),
            xml: untagged,
            expected: { kind: "engineChanged" },
        },
    ])("decides the write from $current", ({ planned, xml, expected }) => {
        expect(planned.writeFrom(new BpmnDocument(xml))).toEqual(expected);
    });
});
