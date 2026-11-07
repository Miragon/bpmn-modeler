import { describe, expect, it } from "vitest";

import type { Engine } from "@miragon/bpmn-modeler-types";

import { ignoredRegistrations, type LoadedPlugin, pluginModulesFor } from "./pluginRegistrations";

const neutralModule = { __init__: ["neutral"] };
const platformModule = { __init__: ["platform"] };
const cloudModule = { __init__: ["cloud"] };
const neutralModdle = { name: "Acme", prefix: "acme", uri: "http://acme", types: [] };
const platformModdle = { name: "AcmeC7", prefix: "acme7", uri: "http://acme/7", types: [] };
const cloudModdle = { name: "AcmeC8", prefix: "acme8", uri: "http://acme/8", types: [] };

const everyRegistration: LoadedPlugin = {
    name: "acme",
    registrations: [
        { type: "bpmn.modeler.additionalModules", plugin: neutralModule },
        { type: "bpmn.platform.modeler.additionalModules", plugin: platformModule },
        { type: "bpmn.cloud.modeler.additionalModules", plugin: cloudModule },
        { type: "bpmn.modeler.moddleExtension", plugin: neutralModdle },
        { type: "bpmn.platform.modeler.moddleExtension", plugin: platformModdle },
        { type: "bpmn.cloud.modeler.moddleExtension", plugin: cloudModdle },
        { type: "client", plugin: () => null },
        { type: "dmn.modeler.moddleExtension", plugin: neutralModdle },
    ],
};

describe("pluginModulesFor", () => {
    it.each<{
        engine: Engine | undefined;
        modules: object[];
        moddleExtensions: Record<string, object>;
    }>([
        {
            engine: undefined,
            modules: [neutralModule],
            moddleExtensions: { acme: neutralModdle },
        },
        {
            engine: "c7",
            modules: [neutralModule, platformModule],
            moddleExtensions: { acme: neutralModdle, acme7: platformModdle },
        },
        {
            engine: "c8",
            modules: [neutralModule, cloudModule],
            moddleExtensions: { acme: neutralModdle, acme8: cloudModdle },
        },
    ])(
        "gives an $engine model the engine-neutral registrations and its own engine's",
        ({ engine, modules, moddleExtensions }) => {
            expect(pluginModulesFor([everyRegistration], engine)).toEqual({
                additionalModules: modules,
                moddleExtensions,
            });
        },
    );

    it("keeps the plugins' order, so a later plugin's module overrides an earlier one", () => {
        const first: LoadedPlugin = {
            name: "first",
            registrations: [{ type: "bpmn.modeler.additionalModules", plugin: platformModule }],
        };
        const second: LoadedPlugin = {
            name: "second",
            registrations: [{ type: "bpmn.modeler.additionalModules", plugin: cloudModule }],
        };

        expect(pluginModulesFor([first, second], "c7").additionalModules).toEqual([
            platformModule,
            cloudModule,
        ]);
    });

    it("keys a moddle extension by its prefix, as bpmn-js reads it", () => {
        const plugin: LoadedPlugin = {
            name: "named",
            registrations: [
                {
                    type: "bpmn.modeler.moddleExtension",
                    plugin: { name: "Other", prefix: "other", uri: "u", types: [] },
                },
            ],
        };

        expect(Object.keys(pluginModulesFor([plugin], "c7").moddleExtensions)).toEqual(["other"]);
    });
});

describe("ignoredRegistrations", () => {
    it("names what a plugin registered that this modeler cannot run", () => {
        expect(ignoredRegistrations([everyRegistration])).toEqual([
            { plugin: "acme", type: "client" },
            { plugin: "acme", type: "dmn.modeler.moddleExtension" },
        ]);
    });

    it("ignores a moddle extension without a prefix, which bpmn-moddle cannot register", () => {
        const plugin: LoadedPlugin = {
            name: "broken",
            registrations: [{ type: "bpmn.modeler.moddleExtension", plugin: { name: "x" } }],
        };

        expect(ignoredRegistrations([plugin])).toEqual([
            { plugin: "broken", type: "bpmn.modeler.moddleExtension" },
        ]);
        expect(pluginModulesFor([plugin], "c7").moddleExtensions).toEqual({});
    });
});
