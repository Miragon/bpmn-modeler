import { describe, expect, it } from "vitest";

import type { BpmnFeature } from "./bpmnFeature";
import {
    type FeatureOutcome,
    mergeFeatures,
    moddlePrefixUnderTwoKeys,
    settleFeatures,
} from "./featureMerge";

const KERNEL_NAMES = ["surfaceRoots"];
const RESERVED_NAMES = ["surfaceRoots", "surfaceMode"];

function feature(id: string, extra: Partial<BpmnFeature> = {}): BpmnFeature {
    return { id, modules: [{ [id]: ["value", id] }], ...extra };
}

function merge(builtIns: readonly BpmnFeature[], plugins: readonly BpmnFeature[] = []) {
    return mergeFeatures(builtIns, plugins, {
        kernelNames: KERNEL_NAMES,
        reservedNames: RESERVED_NAMES,
    });
}

function merged(builtIns: readonly BpmnFeature[], plugins: readonly BpmnFeature[] = []) {
    const result = merge(builtIns, plugins);
    if (result.kind !== "merged") {
        throw new Error(`expected a merge, got ${result.problem}`);
    }
    return result;
}

const fulfilled = (value: unknown): FeatureOutcome => ({ status: "fulfilled", value });
const rejected = (reason: unknown): FeatureOutcome => ({ status: "rejected", reason });

describe("mergeFeatures: modules", () => {
    it("keeps the features in list order, each feature's modules in its own order", () => {
        const first = { first: ["value", 1] };
        const second = { second: ["value", 2] };
        const third = { third: ["value", 3] };

        const { modules } = merged([
            { id: "a", modules: [first, second] },
            { id: "b", modules: [third] },
        ]);

        expect(modules).toEqual([first, second, third]);
    });

    it("merges the plugins after every feature, so a plugin's provider wins in didi", () => {
        const builtIn = { shared: ["value", "built-in"] };
        const plugin = { shared: ["value", "plugin"] };

        const { modules } = merged(
            [{ id: "a", modules: [builtIn] }, feature("b")],
            [{ id: "p", modules: [plugin] }],
        );

        expect(modules.at(-1)).toBe(plugin);
        expect(modules.indexOf(builtIn)).toBe(0);
    });
});

describe("mergeFeatures: config", () => {
    const panelParent = document.createElement("div");
    const popupContainer = document.createElement("div");
    class Instance {}
    const instance = new Instance();

    it.each<{
        name: string;
        configs: readonly Record<string, unknown>[];
        expected: Record<string, unknown>;
    }>([
        {
            name: "merges plain objects key by key",
            configs: [
                { propertiesPanel: { parent: panelParent } },
                { propertiesPanel: { feelPopupContainer: popupContainer } },
            ],
            expected: {
                propertiesPanel: { parent: panelParent, feelPopupContainer: popupContainer },
            },
        },
        {
            name: "lets a later leaf win",
            configs: [{ minimap: { open: false } }, { minimap: { open: true } }],
            expected: { minimap: { open: true } },
        },
        {
            name: "replaces an array instead of merging it",
            configs: [{ list: [1, 2] }, { list: [3] }],
            expected: { list: [3] },
        },
        {
            name: "replaces a plain object with a DOM node or a class instance",
            configs: [
                { a: { x: 1 }, b: { y: 2 } },
                { a: panelParent, b: instance },
            ],
            expected: { a: panelParent, b: instance },
        },
        {
            name: "replaces a DOM node with a plain object rather than merging into it",
            configs: [{ a: panelParent }, { a: { x: 1 } }],
            expected: { a: { x: 1 } },
        },
        {
            name: "skips a key set to undefined",
            configs: [
                { a: 1, nested: { b: 2 } },
                { a: undefined, nested: { b: undefined } },
            ],
            expected: { a: 1, nested: { b: 2 } },
        },
    ])("$name", ({ configs, expected }) => {
        const result = merged(configs.map((config, index) => feature(`f${index}`, { config })));

        expect(result.config).toEqual(expected);
    });

    it("keeps the identity of a replaced DOM node and leaves every input unchanged", () => {
        const first = Object.freeze({ propertiesPanel: Object.freeze({ parent: panelParent }) });
        const second = Object.freeze({
            propertiesPanel: Object.freeze({ feelPopupContainer: popupContainer }),
        });

        const { config } = merged([
            feature("a", { config: first }),
            feature("b", { config: second }),
        ]);

        expect((config.propertiesPanel as { parent: unknown }).parent).toBe(panelParent);
        expect(first).toEqual({ propertiesPanel: { parent: panelParent } });
        expect(second).toEqual({ propertiesPanel: { feelPopupContainer: popupContainer } });
    });
});

describe("mergeFeatures: moddle extensions", () => {
    const camunda = { name: "Camunda", prefix: "camunda", uri: "a" };
    const camundaOverride = { name: "Camunda", prefix: "camunda", uri: "b" };
    const acme = { name: "Acme", prefix: "acme", uri: "c" };

    it("keeps one package per prefix, the later one, whatever key it was listed under", () => {
        const { moddleExtensions } = merged([
            feature("engine", { moddleExtensions: { camunda } }),
            feature("caller", { moddleExtensions: { mine: camundaOverride, acme } }),
        ]);

        expect(moddleExtensions).toEqual({ camunda: camundaOverride, acme });
    });

    it("keys a package without a prefix by its record key", () => {
        const unprefixed = { name: "Loose" };

        const { moddleExtensions } = merged([
            feature("a", { moddleExtensions: { loose: unprefixed } }),
        ]);

        expect(moddleExtensions).toEqual({ loose: unprefixed });
    });

    it("drops a plugin that replaces a built-in's prefix and names both", () => {
        const result = merged(
            [feature("engine", { moddleExtensions: { camunda } })],
            [feature("rogue", { moddleExtensions: { camunda: camundaOverride } })],
        );

        expect(result.moddleExtensions).toEqual({ camunda });
        expect(result.droppedPlugins).toEqual([
            {
                feature: "rogue",
                problem: 'replaces the moddle prefix "camunda" of the built-in "engine"',
            },
        ]);
        expect(result.modules).not.toContainEqual({ rogue: ["value", "rogue"] });
    });

    it("lets a plugin add a prefix of its own", () => {
        const result = merged(
            [feature("engine", { moddleExtensions: { camunda } })],
            [feature("addOn", { moddleExtensions: { acme } })],
        );

        expect(result.moddleExtensions).toEqual({ camunda, acme });
        expect(result.droppedPlugins).toEqual([]);
    });
});

describe("moddlePrefixUnderTwoKeys", () => {
    const camunda = { name: "Camunda", prefix: "camunda", uri: "a" };
    const camundaOverride = { name: "Camunda", prefix: "camunda", uri: "b" };
    const acme = { name: "Acme", prefix: "acme", uri: "c" };

    it("passes distinct prefixes and a key a later feature lists again", () => {
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { camunda: camundaOverride, acme } }),
            ]),
        ).toBeUndefined();
    });

    it("names a prefix that a second key carries, across features or within one", () => {
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { mine: camundaOverride } }),
            ]),
        ).toBe("camunda");
        expect(
            moddlePrefixUnderTwoKeys([
                feature("caller", {
                    moddleExtensions: { "acme-plugin": acme, "acme-copy": { ...acme } },
                }),
            ]),
        ).toBe("acme");
    });

    it("forgets a package whose key a later feature lists with another prefix", () => {
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { camunda: acme, acme } }),
            ]),
        ).toBe("acme");
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { camunda: acme } }),
            ]),
        ).toBeUndefined();
    });
});

describe("mergeFeatures: requires", () => {
    const provides = (name: string) => [{ [name]: ["value", name] }];

    it.each<{ name: string; builtIns: readonly BpmnFeature[] }>([
        {
            name: "a feature listed after it",
            builtIns: [
                feature("needs", { requires: ["x"] }),
                { id: "has", modules: provides("x") },
            ],
        },
        {
            name: "a feature listed before it",
            builtIns: [
                { id: "has", modules: provides("x") },
                feature("needs", { requires: ["x"] }),
            ],
        },
        {
            name: "a module a feature depends on",
            builtIns: [
                { id: "has", modules: [{ __depends__: [{ x: ["value", 1] }] }] },
                feature("needs", { requires: ["x"] }),
            ],
        },
        {
            name: "a kernel name",
            builtIns: [feature("needs", { requires: ["surfaceRoots"] })],
        },
    ])("is satisfied by $name", ({ builtIns }) => {
        expect(merge(builtIns).kind).toBe("merged");
    });

    it("fails the surface for a built-in that misses a name, naming it and the name", () => {
        expect(merge([feature("clipboard", { requires: ["nativeCopyPaste"] })])).toEqual({
            kind: "failed",
            feature: "clipboard",
            problem: 'requires "nativeCopyPaste", which no feature provides',
        });
    });

    it("does not count a didi key such as __init__ as a provided name", () => {
        const result = merge([
            { id: "init", modules: [{ __init__: ["x"] }] },
            feature("needs", { requires: ["__init__"] }),
        ]);

        expect(result.kind).toBe("failed");
    });

    it("does not let a built-in rely on a plugin, which may be dropped", () => {
        const result = merge(
            [feature("needs", { requires: ["x"] })],
            [{ id: "p", modules: provides("x") }],
        );

        expect(result).toMatchObject({ kind: "failed", feature: "needs" });
    });

    it("drops a plugin that misses a name, and a plugin that needed only what it provided", () => {
        const result = merged(
            [feature("a")],
            [
                { id: "p", modules: provides("y"), requires: ["missing"] },
                { id: "q", modules: provides("z"), requires: ["y"] },
                { id: "r", modules: provides("w"), requires: ["a"] },
            ],
        );

        expect(result.droppedPlugins).toEqual([
            { feature: "p", problem: 'requires "missing", which no feature provides' },
            { feature: "q", problem: 'requires "y", which no feature provides' },
        ]);
        expect(result.modules).toEqual([{ a: ["value", "a"] }, ...provides("w")]);
    });
});

describe("mergeFeatures: what the kernel owns", () => {
    it("fails a built-in that provides a reserved name", () => {
        expect(merge([{ id: "rogue", modules: [{ surfaceRoots: ["value", []] }] }])).toEqual({
            kind: "failed",
            feature: "rogue",
            problem: 'provides "surfaceRoots", which the kernel owns',
        });
    });

    it("drops a plugin that provides a reserved name", () => {
        const result = merged(
            [feature("a")],
            [{ id: "rogue", modules: [{ surfaceMode: ["value", {}] }] }],
        );

        expect(result.droppedPlugins).toEqual([
            { feature: "rogue", problem: 'provides "surfaceMode", which the kernel owns' },
        ]);
    });

    it.each(["container", "additionalModules", "modules", "moddleExtensions"])(
        "fails a built-in whose config sets %s",
        (key) => {
            expect(merge([feature("rogue", { config: { [key]: 1 } })])).toEqual({
                kind: "failed",
                feature: "rogue",
                problem: `sets config "${key}", which the kernel owns`,
            });
        },
    );
});

describe("settleFeatures", () => {
    it("hands every loaded descriptor on, built-ins and plugins apart", () => {
        const a = feature("a");
        const p = feature("p");

        expect(settleFeatures([fulfilled(a)], [fulfilled(p)])).toEqual({
            kind: "loaded",
            builtIns: [a],
            plugins: [p],
            droppedPlugins: [],
        });
    });

    it("fails on the first built-in that rejected, by its position, with its reason", () => {
        const reason = new Error("offline");

        expect(settleFeatures([fulfilled(feature("a")), rejected(reason)], [])).toEqual({
            kind: "failed",
            feature: "feature #2",
            problem: "failed to load",
            reason,
        });
    });

    it.each<{ name: string; value: unknown; label: string }>([
        { name: "without an id", value: { modules: [] }, label: "feature #1" },
        { name: "with an empty id", value: { id: "", modules: [] }, label: "feature #1" },
        { name: "without a module list", value: { id: "half" }, label: "half" },
        { name: "that is not an object", value: 42, label: "feature #1" },
    ])("fails on a built-in $name", ({ value, label }) => {
        expect(settleFeatures([fulfilled(value)], [])).toMatchObject({
            kind: "failed",
            feature: label,
            problem: "is not a BpmnFeature: it needs an id and a modules array",
        });
    });

    it("drops a rejected or malformed plugin by its position or id and keeps the others", () => {
        const kept = feature("kept");

        expect(
            settleFeatures(
                [],
                [rejected(new Error("404")), fulfilled({ id: "half" }), fulfilled(kept)],
            ),
        ).toEqual({
            kind: "loaded",
            builtIns: [],
            plugins: [kept],
            droppedPlugins: [
                { feature: "plugin #1", problem: "failed to load: 404" },
                {
                    feature: "half",
                    problem: "is not a BpmnFeature: it needs an id and a modules array",
                },
            ],
        });
    });
});
