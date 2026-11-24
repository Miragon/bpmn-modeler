import type { Injector, ModuleDeclaration } from "didi";
import Diagram from "diagram-js/lib/Diagram";
import { describe, expect, it } from "vitest";

import {
    assembleModules,
    configLeaves,
    disagreementsWithInjector,
    flattenModules,
    moddlePackageLines,
    optionDelta,
    overridesOf,
    renderPins,
    winningValueOf,
    type DidiInjector,
    type DiModule,
    type SurfacePins,
} from "./diModuleAssembly";

class First {}
class Second {}
class Third {}

// The surfaces run on the didi diagram-js resolves, which need not be the root `didi`.
function injectorClassOfDiagramJs(): typeof Injector {
    const diagram = new Diagram();
    try {
        return diagram.get<object>("injector").constructor as typeof Injector;
    } finally {
        diagram.destroy();
    }
}

const DiagramJsInjector = injectorClassOfDiagramJs();

function builtInjector(modules: DiModule[]): DidiInjector & { init(): void } {
    const injector = new DiagramJsInjector(modules as ModuleDeclaration[]);
    injector.init();
    return injector as unknown as DidiInjector & { init(): void };
}

function pinsOf(
    modules: readonly DiModule[],
    config: object = { modules },
    moddlePackages: readonly { prefix: string; uri: string }[] = [],
): SurfacePins {
    return {
        assembly: assembleModules(modules),
        config: configLeaves(config),
        moddlePackages: moddlePackageLines(moddlePackages),
    };
}

describe("diModuleAssembly against didi's own injector", () => {
    it("flattens dependencies first, registers a module once and runs __init__ in that order", () => {
        const ran: string[] = [];
        const shared: DiModule = { shared: ["value", 1], __init__: [() => ran.push("shared")] };
        const middle: DiModule = {
            __depends__: [shared],
            middle: ["value", 2],
            __init__: [() => ran.push("middle")],
        };
        const top: DiModule = {
            __depends__: [shared, middle],
            top: ["value", 3],
            __init__: ["middle", () => ran.push("top")],
        };
        const list = [top, middle, shared];

        builtInjector(list);

        expect(flattenModules(list)).toEqual([shared, middle, top]);
        expect(ran).toEqual(["shared", "middle", "top"]);
        expect(assembleModules(list).inits.map(({ text }) => text)).toEqual([
            "fn <anonymous>() @shared",
            "fn <anonymous>() @middle",
            "middle @top",
            "fn <anonymous>() @top",
        ]);
    });

    it("names the last registration of a DI name as its winner, as the injector resolves it", () => {
        const list: DiModule[] = [
            { service: ["type", First] },
            { __depends__: [{ service: ["type", Second] }], other: ["value", "x"] },
            { service: ["type", Third] },
        ];

        expect(overridesOf(assembleModules(list))).toEqual({
            service: {
                winner: "type(Third) @service",
                over: ["type(Second) @service", "type(First) @service"],
            },
        });
        expect(disagreementsWithInjector(assembleModules(list), builtInjector(list))).toEqual([]);
    });

    it("reports a winner the injector does not hold", () => {
        const first: DiModule = { service: ["type", First] };
        const second: DiModule = { service: ["type", Second] };

        expect(
            disagreementsWithInjector(
                assembleModules([first, second]),
                builtInjector([second, first]),
            ),
        ).toEqual(["service: the injector stores another provider than type(Second)"]);
    });

    it("prints a renamed class by its source name, an anonymous factory by what it injects", () => {
        class Renamed$1 {}
        const list: DiModule[] = [
            { __depends__: [{ renamed: ["type", Renamed$1] }] },
            { made: ["factory", ["eventBus", (bus: unknown) => bus]] },
            { parsed: ["factory", (canvas: unknown, overlays: unknown) => [canvas, overlays]] },
        ];

        expect(assembleModules(list).modules.map(({ text }) => text)).toEqual([
            "renamed=type(Renamed)",
            "depends[renamed]",
            "made=factory(<anonymous>(eventBus))",
            "parsed=factory(<anonymous>(canvas, overlays))",
        ]);
    });

    it("prints plain data by its content with sorted keys, anything else by its type", () => {
        const list: DiModule[] = [
            { tier: ["value", { mode: "design", tier: "in-page", engine: undefined }] },
            { names: ["value", ["b", "a"]] },
            { port: ["value", { open: () => undefined }] },
            { instance: ["value", new First()] },
            { node: ["value", document.createElement("div")] },
        ];

        expect(assembleModules(list).modules.map(({ text }) => text)).toEqual([
            'tier=value({"mode":"design","tier":"in-page"})',
            'names=value(["b","a"])',
            "port=value(Object)",
            "instance=value(First)",
            "node=value(HTMLDivElement)",
        ]);
    });

    it("reads the value a DI name resolves to", () => {
        const annotations = new First();
        const assembly = assembleModules([
            { annotations: ["value", new Second()] },
            { annotations: ["value", annotations] },
        ]);

        expect(winningValueOf(assembly, "annotations")).toBe(annotations);
        expect(() => winningValueOf(assembly, "missing")).toThrow("missing");
    });

    it("refuses a private didi module", () => {
        expect(() => assembleModules([{ __exports__: ["a"], a: ["value", 1] }])).toThrow(
            "private didi modules",
        );
    });

    it("shows a moved module as a removal and an addition at its new position", () => {
        const one: DiModule = { one: ["value", 1] };
        const two: DiModule = { two: ["value", 2] };
        const three: DiModule = { three: ["value", 3] };

        expect(optionDelta(pinsOf([one, two, three]), pinsOf([two, one, three]))).toEqual([
            "modules:",
            "+ two=value(2) (first)",
            "- two=value(2)",
        ]);
    });

    it("prints each config leaf by key path, walking plain objects, and leaves out what is pinned elsewhere", () => {
        const container = document.createElement("div");
        const tooltip = { "group-general": (element: unknown) => element };

        expect([
            ...configLeaves({
                modules: [{ one: ["value", 1] }],
                moddleExtensions: { camunda: { prefix: "camunda" } },
                propertiesPanel: { parent: container, tooltip, layout: {} },
                popupMenu: { defaultTab: "bpmn" },
                alignToOrigin: { offset: 150, tolerance: 50 },
                names: ["b", "a"],
                propertiesPanelMode: "implement",
                getFeelPopupLinks: (type: string) => type,
                instance: new First(),
            }),
        ]).toEqual([
            ["alignToOrigin.offset", "150"],
            ["alignToOrigin.tolerance", "50"],
            ["getFeelPopupLinks", "fn getFeelPopupLinks"],
            ["instance", "First"],
            ["names", '["b","a"]'],
            ["popupMenu.defaultTab", '"bpmn"'],
            ["propertiesPanel.layout", "{}"],
            ["propertiesPanel.parent", "HTMLDivElement"],
            ["propertiesPanel.tooltip.group-general", "fn group-general"],
            ["propertiesPanelMode", '"implement"'],
        ]);
    });

    it("prints a config object that holds itself once, by type", () => {
        const looped: Record<string, unknown> = { flag: true };
        looped.self = looped;

        expect([...configLeaves({ looped })]).toEqual([
            ["looped.flag", "true"],
            ["looped.self", "Object"],
        ]);
    });

    it("pins the config and the moddle packages after the modules", () => {
        const pins = pinsOf([{ one: ["value", 1] }], { mode: "design" }, [
            { prefix: "bpmn", uri: "http://www.omg.org/spec/BPMN/20100524/MODEL" },
            { prefix: "camunda", uri: "http://camunda.org/schema/1.0/bpmn" },
        ]);

        const rendered = renderPins("probe", pins);

        expect(rendered.slice(rendered.indexOf("## __init__"))).toBe(
            [
                "## __init__ (run order)",
                "",
                "## config (by key path, without `modules` and `moddleExtensions`)",
                'mode: "design"',
                "",
                "## moddle packages (registration order)",
                "bpmn http://www.omg.org/spec/BPMN/20100524/MODEL",
                "camunda http://camunda.org/schema/1.0/bpmn",
                "",
            ].join("\n"),
        );
    });

    it("shows what an option adds, removes or replaces in the config and the moddle packages", () => {
        const bpmn = { prefix: "bpmn", uri: "bpmn-uri" };
        const zeebe = { prefix: "zeebe", uri: "zeebe-uri" };
        const camunda = { prefix: "camunda", uri: "camunda-uri" };

        expect(
            optionDelta(
                pinsOf([], { mode: "implement", minimap: { open: false } }, [bpmn, zeebe]),
                pinsOf([], { mode: "design", extra: 1 }, [bpmn, camunda]),
            ),
        ).toEqual([
            "config:",
            "+ extra: 1",
            "- minimap.open: false",
            '~ mode: "implement" → "design"',
            "moddle packages:",
            "+ camunda camunda-uri (after bpmn)",
            "- zeebe zeebe-uri",
        ]);
    });

    it("anchors an addition behind the last default to the defaults, not to that module", () => {
        const one: DiModule = { one: ["value", 1] };
        const two: DiModule = { two: ["value", 2] };
        const group: DiModule = { __depends__: [one, two] };
        const inserted: DiModule = { inserted: ["value", 3] };
        const appended: DiModule = { appended: ["value", 4] };
        const last: DiModule = { last: ["value", 5] };

        expect(
            optionDelta(
                pinsOf([group, last], {}),
                pinsOf([group, inserted, last, appended], {}),
            ).filter((line) => line.startsWith("+") && line.includes("=")),
        ).toEqual([
            "+ inserted=value(3) (after […, two])",
            "+ appended=value(4) (after the defaults)",
        ]);
    });
});
