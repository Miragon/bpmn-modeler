import { afterEach, describe, expect, it, vi } from "vitest";

import type { Command, Query } from "@miragon/bpmn-modeler-shared";
import type { LoadedPlugins, PluginModules } from "@miragon/bpmn-modeler/plugins";

import { loadSurfacePlugins } from "./surfacePlugins";

const mocks = vi.hoisted(() => ({ loadPlugins: vi.fn() }));

vi.mock("@miragon/bpmn-modeler/plugins", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@miragon/bpmn-modeler/plugins")>()),
    loadPlugins: mocks.loadPlugins,
}));

const acmeModule = { __init__: ["acme"] };
const asset = { name: "Acme", scriptUrl: "https://host/acme/plugin.js" };

function loaded(overrides: Partial<LoadedPlugins> = {}): LoadedPlugins {
    return {
        plugins: [{ name: "Acme", registrations: [] }],
        failures: [],
        ignored: [],
        modulesFor: () => ({ additionalModules: [acmeModule], moddleExtensions: {} }),
        ...overrides,
    };
}

function recordingHost() {
    const posted: (Command | Query)[] = [];
    return { posted, host: { postMessage: (message: Command | Query) => posted.push(message) } };
}

describe("loadSurfacePlugins", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("builds without plugin modules and never runs the loader when the host sends none", async () => {
        const { host, posted } = recordingHost();
        const builds: PluginModules[] = [];

        const plugins = await loadSurfacePlugins([], host);
        await plugins.build("c7", async (modules) => builds.push(modules));

        expect(builds).toEqual([{ additionalModules: [], moddleExtensions: {} }]);
        expect(mocks.loadPlugins).not.toHaveBeenCalled();
        expect(posted).toEqual([]);
    });

    it("tells the host which plugins could not be loaded", async () => {
        mocks.loadPlugins.mockResolvedValue(
            loaded({ failures: [{ plugin: "Broken", reason: "boom" }] }),
        );
        const { host, posted } = recordingHost();

        await loadSurfacePlugins([asset], host);

        expect(mocks.loadPlugins).toHaveBeenCalledExactlyOnceWith([asset]);
        expect(posted).toEqual([
            expect.objectContaining({
                type: "LogWarningCommand",
                message: 'BPMN plugin "Broken" left out: boom',
            }),
            expect.objectContaining({
                type: "ShowInfoCommand",
                message: "A BPMN plugin could not be loaded and is left out. See the log for details.",
            }),
        ]);
    });

    it("opens without the plugins and tells the host when they break the construction", async () => {
        mocks.loadPlugins.mockResolvedValue(loaded());
        const { host, posted } = recordingHost();
        const builds: PluginModules[] = [];
        const plugins = await loadSurfacePlugins([asset], host);

        const surface = await plugins.build("c7", async (modules) => {
            builds.push(modules);
            if (builds.length === 1) {
                throw new Error('No provider for "missing"!');
            }
            return "surface";
        });

        expect(surface).toBe("surface");
        expect(builds).toEqual([
            { additionalModules: [acmeModule], moddleExtensions: {} },
            { additionalModules: [], moddleExtensions: {} },
        ]);
        expect(posted.map((message) => message.type)).toEqual([
            "LogWarningCommand",
            "ShowInfoCommand",
        ]);
    });
});
