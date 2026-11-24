import type { Injector } from "didi";
import Diagram from "diagram-js/lib/Diagram";
import { describe, expect, it } from "vitest";

import {
    assembleModules,
    disagreementsWithInjector,
    flattenModules,
    injectorModulesOf,
    overridesOf,
    winningValueOf,
    type DidiInjector,
    type DiModule,
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

function builtInjector(modules: DiModule[]): DidiInjector {
    const injector = new DiagramJsInjector(modules);
    injector.init();
    return injector as unknown as DidiInjector;
}

describe("diModuleAssembly", () => {
    describe("resolves modules as the injector diagram-js builds does", () => {
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

        it("walks sibling dependencies left to right", () => {
            const ran: string[] = [];
            const left: DiModule = { left: ["value", 1], __init__: [() => ran.push("left")] };
            const right: DiModule = { right: ["value", 2], __init__: [() => ran.push("right")] };
            const both: DiModule = { __depends__: [left, right] };

            const injector = builtInjector([both]);

            expect(flattenModules([both])).toEqual([left, right, both]);
            expect(ran).toEqual(["left", "right"]);
            expect(disagreementsWithInjector(assembleModules([both]), injector)).toEqual([]);
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
            expect(disagreementsWithInjector(assembleModules(list), builtInjector(list))).toEqual(
                [],
            );
        });

        it("lists the modules diagram-js hands its injector", () => {
            const probe: DiModule = { probe: ["value", "probe"], __init__: ["probe"] };
            const diagram = new Diagram({ modules: [probe] });
            try {
                const config = diagram.get<{ modules: DiModule[] }>("config");

                expect(
                    disagreementsWithInjector(
                        assembleModules(injectorModulesOf(config)),
                        diagram.get<DidiInjector>("injector"),
                    ),
                ).toEqual([]);
            } finally {
                diagram.destroy();
            }
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

        it("reports a DI name only the injector or only the assembly knows", () => {
            const one: DiModule = { one: ["value", 1] };
            const two: DiModule = { two: ["value", 2] };

            expect(
                disagreementsWithInjector(assembleModules([one]), builtInjector([one, two])),
            ).toEqual(["two: registered, but not in the assembly"]);
            expect(
                disagreementsWithInjector(assembleModules([one, two]), builtInjector([one])),
            ).toEqual(["two: in the assembly, but not registered"]);
        });

        it("reports DI names first registered in another order than the injector's", () => {
            const one: DiModule = { one: ["value", 1] };
            const two: DiModule = { two: ["value", 2] };

            expect(
                disagreementsWithInjector(assembleModules([one, two]), builtInjector([two, one])),
            ).toEqual([
                "first registration order: the assembly has one where the injector has two",
            ]);
        });

        it("reports an __init__ order the injector does not run for the same modules", () => {
            const module: DiModule = {
                one: ["value", 1],
                two: ["value", 2],
                __init__: ["one", "two"],
            };
            const assembly = assembleModules([module]);

            expect(
                disagreementsWithInjector(
                    { ...assembly, inits: [...assembly.inits].reverse() },
                    builtInjector([module]),
                ),
            ).toEqual(["__init__ order: the assembly has two @one where the injector has one"]);
        });

        it("names the cause when didi no longer exposes its provider table", () => {
            expect(() =>
                disagreementsWithInjector(assembleModules([]), {} as DidiInjector),
            ).toThrow("didi no longer exposes _providers");
        });
    });

    describe("prints what each module registers", () => {
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

        it("prints plain data by its content with sorted keys, a record of leaves item by item, anything else by its type", () => {
            const list: DiModule[] = [
                { tier: ["value", { mode: "design", tier: "in-page", engine: undefined }] },
                { names: ["value", ["b", "a"]] },
                { port: ["value", { open: () => undefined, flag: true, closed: undefined }] },
                { nested: ["value", { port: { open: () => undefined } }] },
                { instance: ["value", new First()] },
                { node: ["value", document.createElement("div")] },
            ];

            expect(assembleModules(list).modules.map(({ text }) => text)).toEqual([
                'tier=value({"mode":"design","tier":"in-page"})',
                'names=value(["b","a"])',
                "port=value({flag: true, open: fn open})",
                "nested=value(Object)",
                "instance=value(First)",
                "node=value(HTMLDivElement)",
            ]);
        });

        it("appends a value's name to its type, so two values of one type tell apart", () => {
            const port = { open: () => undefined };
            const node = document.createElement("div");
            const names = new Map<object, string>([
                [port, ": probe port"],
                [node, "#1"],
            ]);

            expect(
                assembleModules(
                    [
                        {
                            port: ["value", port],
                            other: ["value", { open: () => undefined }],
                            node: ["value", node],
                        },
                    ],
                    names,
                ).modules.map(({ text }) => text),
            ).toEqual([
                "port=value(Object: probe port) other=value({open: fn open}) node=value(HTMLDivElement#1)",
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
    });
});
