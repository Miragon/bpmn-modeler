import { Injector, type ModuleDeclaration } from "didi";
import { describe, expect, it } from "vitest";

import {
    assembleModules,
    disagreementsWithInjector,
    flattenModules,
    optionDelta,
    overridesOf,
    winningValueOf,
    type DidiInjector,
    type DiModule,
} from "./diModuleAssembly";

class First {}
class Second {}
class Third {}

function builtInjector(modules: DiModule[]): DidiInjector & { init(): void } {
    const injector = new Injector(modules as ModuleDeclaration[]);
    injector.init();
    return injector as unknown as DidiInjector & { init(): void };
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

        expect(
            optionDelta(assembleModules([one, two, three]), assembleModules([two, one, three])),
        ).toEqual(["modules:", "+ two=value(2) (first)", "- two=value(2)"]);
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
                assembleModules([group, last]),
                assembleModules([group, inserted, last, appended]),
            ).filter((line) => line.startsWith("+") && line.includes("=")),
        ).toEqual([
            "+ inserted=value(3) (after […, two])",
            "+ appended=value(4) (after the defaults)",
        ]);
    });
});
