import { describe, expect, it } from "vitest";

import { baseModel, removeNode } from "./baseModel";
import { renderBpmn } from "./bpmnModelBuilder";
import {
    ALL_CONFLICTS_SCENARIO,
    MERGE_SCENARIOS,
    PLATFORM_ONLY_SCENARIO,
    scenarioNamed,
} from "./mergeScenarios";
import {
    ENGINE_NAMESPACES,
    parseWithoutWarnings,
    serializeAsModeler,
} from "./parseWithoutWarnings";

const scenarioVersions = MERGE_SCENARIOS.flatMap((scenario) =>
    (["base", "current", "incoming"] as const).flatMap((version) => {
        const xml = scenario[version];
        return xml === undefined
            ? []
            : [{ name: `${scenario.name} / ${version}`, platform: scenario.platform, xml }];
    }),
);

const NAMED_BY_PLATFORM_ONLY = new Set([
    `${PLATFORM_ONLY_SCENARIO} / base`,
    `${PLATFORM_ONLY_SCENARIO} / current`,
]);

describe("merge scenarios", () => {
    it("have unique names", () => {
        const names = MERGE_SCENARIOS.map((scenario) => scenario.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it.each(scenarioVersions)("$name parses without warnings", async ({ xml }) => {
        await expect(parseWithoutWarnings(xml)).resolves.toBeDefined();
    });

    it.each(scenarioVersions)("$name is what the modeler's save writes", async ({ xml }) => {
        expect(await serializeAsModeler(xml)).toBe(xml);
    });

    it.each(scenarioVersions.filter(({ name }) => !NAMED_BY_PLATFORM_ONLY.has(name)))(
        "$name declares its engine namespace",
        ({ platform, xml }) => {
            expect(xml).toContain(`="${ENGINE_NAMESPACES[platform]}"`);
        },
    );

    it.each([...NAMED_BY_PLATFORM_ONLY])("%s names its engine by the platform only", (name) => {
        const version = scenarioVersions.find((candidate) => candidate.name === name)!;
        expect(version.xml).not.toContain(ENGINE_NAMESPACES[version.platform]);
        expect(version.xml).toContain('modeler:executionPlatform="Camunda Cloud"');
    });

    it.each(
        MERGE_SCENARIOS.filter(
            (scenario) => scenario.base !== undefined && scenario.name !== "table: unchanged",
        ),
    )("$name changes at least one side", ({ base, current, incoming }) => {
        expect(current !== base || incoming !== base).toBe(true);
    });

    it("covers the Camunda 7 and the Camunda 8 engine", () => {
        expect(new Set(MERGE_SCENARIOS.map((scenario) => scenario.platform))).toEqual(
            new Set(["c7", "c8"]),
        );
    });

    it("names the exhaustive-check fixture", () => {
        expect(scenarioNamed(ALL_CONFLICTS_SCENARIO).base).toBeDefined();
        expect(() => scenarioNamed("no such scenario")).toThrow("no such scenario");
    });
});

describe("renderBpmn", () => {
    it.each(["c7", "c8"] as const)(
        "leaves out the %s engine namespace when nothing uses it, as the save does",
        async (platform) => {
            const model = removeNode(baseModel(platform), "Task_Check");
            model.processAttributes = {};
            const xml = renderBpmn(model);

            expect(xml).not.toContain(ENGINE_NAMESPACES[platform]);
            expect(await serializeAsModeler(xml)).toBe(xml);
        },
    );

    it("writes a process without a pool as what the save writes", async () => {
        const model = baseModel("c7");
        model.pools = [];
        model.lanes = [];
        const xml = renderBpmn(model);

        await expect(parseWithoutWarnings(xml)).resolves.toBeDefined();
        expect(await serializeAsModeler(xml)).toBe(xml);
    });
});

describe("parseWithoutWarnings", () => {
    it("rejects a version with an unresolved reference", async () => {
        const { current } = scenarioNamed("table: unchanged");
        const dangling = current.replace('sourceRef="Start_Order"', 'sourceRef="Missing_Node"');
        await expect(parseWithoutWarnings(dangling)).rejects.toThrow("Missing_Node");
    });
});
