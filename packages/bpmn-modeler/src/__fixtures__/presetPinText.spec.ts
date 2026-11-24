import { describe, expect, it } from "vitest";

import { assembleModules, type DiModule } from "./diModuleAssembly";
import {
    configLeaves,
    moddlePackageLines,
    optionDelta,
    renderPins,
    surfacePinsOf,
    type ModdlePackage,
    type SurfacePins,
} from "./presetPinText";

class Instance {}

function pinsOf(
    modules: readonly DiModule[],
    config: object = { modules },
    moddlePackages: readonly ModdlePackage[] = [],
): SurfacePins {
    return {
        assembly: assembleModules(modules),
        config: configLeaves(config),
        moddlePackages: moddlePackageLines(moddlePackages),
    };
}

describe("presetPinText", () => {
    it("numbers each DOM node by its first appearance and names the objects the caller passed in", () => {
        const container = document.createElement("div");
        const panel = document.createElement("div");
        const stray = document.createElement("div");
        const port = { open: () => undefined };

        const config = {
            modules: [
                { panelRoot: ["value", panel], straySurface: ["value", stray] },
                { probePort: ["value", port] },
            ],
            container,
            propertiesPanel: { parent: panel, feelPopupContainer: container },
        };

        const pins = surfacePinsOf(config, [], new Map([[port, "probe port"]]));

        expect([...pins.config]).toEqual([
            ["container", "HTMLDivElement#1"],
            ["propertiesPanel.feelPopupContainer", "HTMLDivElement#1"],
            ["propertiesPanel.parent", "HTMLDivElement#2"],
        ]);
        expect(pins.assembly.modules.slice(-2).map(({ text }) => text)).toEqual([
            "panelRoot=value(HTMLDivElement#2) straySurface=value(HTMLDivElement#3)",
            "probePort=value(Object: probe port)",
        ]);
    });

    it("prints a list of DOM nodes or a record of callbacks item by item, numbering the nodes inside", () => {
        const container = document.createElement("div");
        const panel = document.createElement("div");
        const onLintResults = (): undefined => undefined;

        const pins = surfacePinsOf(
            {
                modules: [
                    { surfaceRoots: ["value", [container, panel]] },
                    { crossedRoots: ["value", [container, container]] },
                    { lintCallbacks: ["value", { onLintResults, onLintingToggled: undefined }] },
                ],
            },
            [],
            new Map(),
        );

        expect(pins.assembly.modules.slice(-3).map(({ text }) => text)).toEqual([
            "surfaceRoots=value([HTMLDivElement#1, HTMLDivElement#2])",
            "crossedRoots=value([HTMLDivElement#1, HTMLDivElement#1])",
            "lintCallbacks=value({onLintResults: fn onLintResults})",
        ]);
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
                instance: new Instance(),
            }),
        ]).toEqual([
            ["alignToOrigin.offset", "150"],
            ["alignToOrigin.tolerance", "50"],
            ["getFeelPopupLinks", "fn getFeelPopupLinks"],
            ["instance", "Instance"],
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

        expect(rendered.slice(0, rendered.indexOf("## modules"))).toBe(
            [
                "# probe",
                "",
                "DOM nodes print as `#n`, numbered by first appearance: config key paths, then DI names, each sorted.",
                "",
                "",
            ].join("\n"),
        );
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
