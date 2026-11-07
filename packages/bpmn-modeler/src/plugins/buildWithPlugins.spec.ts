import { describe, expect, it, vi } from "vitest";

import type { Engine } from "@miragon/bpmn-modeler-types";

import { buildWithPluginsOrWithout } from "./buildWithPlugins";
import type { PluginModules } from "./pluginRegistrations";

const platformModule = { __init__: ["platform"] };
const acmeModdle = { name: "Acme", prefix: "acme", uri: "http://acme", types: [] };
const NO_MODULES: PluginModules = { additionalModules: [], moddleExtensions: {} };

const PLATFORM_ONLY_MODULES: Record<Engine, PluginModules> = {
    c7: { additionalModules: [platformModule], moddleExtensions: { acme: acmeModdle } },
    c8: NO_MODULES,
};

const platformOnly = {
    modulesFor: (engine: Engine | undefined): PluginModules =>
        engine ? PLATFORM_ONLY_MODULES[engine] : NO_MODULES,
};

describe("buildWithPluginsOrWithout", () => {
    it("builds once with the modules the plugins give the model's engine", async () => {
        const build = vi.fn(async (modules: PluginModules) => ({ modules }));
        const onFallback = vi.fn();

        const surface = await buildWithPluginsOrWithout(platformOnly, "c7", build, onFallback);

        expect(surface.modules).toEqual({
            additionalModules: [platformModule],
            moddleExtensions: { acme: acmeModdle },
        });
        expect(build).toHaveBeenCalledOnce();
        expect(onFallback).not.toHaveBeenCalled();
    });

    it.each([
        ["rejects", async () => Promise.reject(new Error('No provider for "missing"!'))],
        [
            "throws",
            () => {
                throw new Error('No provider for "missing"!');
            },
        ],
    ])(
        "reports the error and builds again without plugins when the build %s",
        async (_kind, failingBuild) => {
            const withoutPlugins = { modules: NO_MODULES };
            const build = vi
                .fn<(modules: PluginModules) => Promise<{ modules: PluginModules }>>()
                .mockImplementationOnce(failingBuild)
                .mockImplementationOnce(async (modules) => ({ modules }));
            const fallbackErrors: unknown[] = [];

            const surface = await buildWithPluginsOrWithout(platformOnly, "c7", build, (error) =>
                fallbackErrors.push(error),
            );

            expect(surface).toEqual(withoutPlugins);
            expect(fallbackErrors).toEqual([new Error('No provider for "missing"!')]);
        },
    );

    it("builds only once and lets the error through when the engine gets no plugin modules", async () => {
        const build = vi.fn(async (_modules: PluginModules) => {
            throw new Error("container detached");
        });
        const onFallback = vi.fn();

        await expect(
            buildWithPluginsOrWithout(platformOnly, "c8", build, onFallback),
        ).rejects.toThrow("container detached");
        expect(build).toHaveBeenCalledExactlyOnceWith(NO_MODULES);
        expect(onFallback).not.toHaveBeenCalled();
    });

    it("rejects with the second error when the build without plugins fails too", async () => {
        const build = vi
            .fn<(modules: PluginModules) => Promise<never>>()
            .mockRejectedValueOnce(new Error("plugin broke"))
            .mockRejectedValueOnce(new Error("container detached"));
        const onFallback = vi.fn();

        await expect(
            buildWithPluginsOrWithout(platformOnly, "c7", build, onFallback),
        ).rejects.toThrow("container detached");
        expect(onFallback).toHaveBeenCalledExactlyOnceWith(new Error("plugin broke"));
    });
});
