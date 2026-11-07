import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClipboardOptions, LintModule, ModelerCapabilities } from "@miragon/bpmn-modeler";
import type { Command, Query } from "@miragon/bpmn-modeler-shared";
import type { BpmnModelerSetting } from "@miragon/bpmn-modeler-types";

import type { Engine } from "@miragon/bpmn-modeler-types";

import { HostModelerState } from "../../domain/hostModelerState";
import { createSurfaceFactories } from "./surfaceFactories";
import type { SurfacePlugins } from "./surfacePlugins";

const mocks = vi.hoisted(() => ({
    createViewer: vi.fn(),
    createDesigner: vi.fn(),
    createModeler: vi.fn(),
}));

vi.mock("./surfaceModules", () => ({
    loadViewerModule: async () => ({ createViewer: mocks.createViewer }),
    loadDesignerModule: async () => ({ createDesigner: mocks.createDesigner }),
    loadModelerModule: async () => ({ createModeler: mocks.createModeler }),
}));

const settings = (favouriteBpmnElements: string[]): BpmnModelerSetting => ({
    alignToOrigin: true,
    showTransactionBoundaries: false,
    colorTheme: "light",
    favouriteBpmnElements,
});

const lintOptions = {
    linting: { results: "external" as const, module: {} as LintModule },
    onLintResults: vi.fn(),
    onLintingToggled: vi.fn(),
};

const capabilities: ModelerCapabilities = {
    modelNavigation: { navigateToReferencedModel: vi.fn() } as never,
    definitionSearch: { search: vi.fn() } as never,
    codeLink: { navigateToImplementation: vi.fn() } as never,
};

const clipboard = { bridge: {} } as unknown as ClipboardOptions;

function factoriesWith(
    hostModelerState = new HostModelerState(),
    plugins: Promise<SurfacePlugins> | undefined = undefined,
) {
    const posted: (Command | Query)[] = [];
    const propertiesPanelParent = document.createElement("div");
    const extraModules = [{ __init__: [] }];
    const onModelerModeChanged = vi.fn();
    const surfaces = createSurfaceFactories(
        { postMessage: (message) => posted.push(message) },
        {
            propertiesPanelParent,
            capabilities,
            extraModules,
            plugins,
            clipboard,
            lintBridge: { surfaceOptions: async () => lintOptions },
            hostModelerState,
            onModelerModeChanged,
        },
    );
    return {
        posted,
        surfaces,
        hostModelerState,
        propertiesPanelParent,
        extraModules,
        onModelerModeChanged,
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((onResolve) => {
        resolve = onResolve;
    });
    return { promise, resolve };
}

const container = document.createElement("div");

describe("createSurfaceFactories", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("builds the readonly viewer with model navigation as its only capability", async () => {
        const viewer = { name: "viewer" };
        mocks.createViewer.mockResolvedValue(viewer);
        const { surfaces, propertiesPanelParent, extraModules } = factoriesWith();

        const built = await surfaces.view!({ container, engine: "c7", theme: "dark" });

        expect(built).toBe(viewer);
        expect(mocks.createViewer).toHaveBeenCalledExactlyOnceWith(container, {
            theme: "dark",
            propertiesPanel: { parent: propertiesPanelParent },
            capabilities: { modelNavigation: capabilities.modelNavigation },
            additionalModules: extraModules,
        });
    });

    it("builds the designer with the host favourites, the clipboard and the lint options", async () => {
        const designer = { setFavouriteBpmnElements: vi.fn() };
        mocks.createDesigner.mockResolvedValue(designer);
        const hostModelerState = new HostModelerState();
        hostModelerState.rememberSettings(settings(["bpmn:UserTask"]));
        const { surfaces, propertiesPanelParent, extraModules } = factoriesWith(hostModelerState);

        await surfaces.design!({ container, engine: undefined, theme: "light" });

        expect(mocks.createDesigner).toHaveBeenCalledExactlyOnceWith(container, {
            theme: "light",
            favouriteBpmnElements: ["bpmn:UserTask"],
            propertiesPanel: { parent: propertiesPanelParent },
            clipboard,
            capabilities: {
                modelNavigation: capabilities.modelNavigation,
                definitionSearch: capabilities.definitionSearch,
            },
            additionalModules: extraModules,
            moddleExtensions: {},
            ...lintOptions,
        });
        expect(designer.setFavouriteBpmnElements).not.toHaveBeenCalled();
    });

    it("hands the designer favourites the host pushed while it initialised", async () => {
        const designer = { setFavouriteBpmnElements: vi.fn() };
        const creation = deferred<typeof designer>();
        mocks.createDesigner.mockReturnValue(creation.promise);
        const { surfaces, hostModelerState } = factoriesWith();

        const built = surfaces.design!({ container, engine: undefined, theme: "light" });
        await vi.waitFor(() => expect(mocks.createDesigner).toHaveBeenCalled());
        hostModelerState.rememberSettings(settings(["bpmn:ServiceTask"]));
        creation.resolve(designer);
        await built;

        expect(designer.setFavouriteBpmnElements).toHaveBeenCalledExactlyOnceWith([
            "bpmn:ServiceTask",
        ]);
    });

    it("refuses to build the modeler for an untagged model", async () => {
        const { surfaces } = factoriesWith();

        await expect(
            surfaces.implement!({
                container,
                engine: undefined as never,
                theme: "light",
                mode: "implement",
            }),
        ).rejects.toThrow("implement surface requires a tagged model");
        expect(mocks.createModeler).not.toHaveBeenCalled();
    });

    it("builds the modeler with the host settings and every capability", async () => {
        const modeler = { setSettings: vi.fn() };
        mocks.createModeler.mockResolvedValue(modeler);
        const hostModelerState = new HostModelerState();
        hostModelerState.rememberSettings(settings([]));
        const { surfaces, propertiesPanelParent, extraModules } = factoriesWith(hostModelerState);

        await surfaces.implement!({ container, engine: "c8", theme: "dark", mode: "design" });

        expect(mocks.createModeler).toHaveBeenCalledExactlyOnceWith(
            container,
            expect.objectContaining({
                engine: "c8",
                mode: "design",
                theme: "dark",
                settings: settings([]),
                propertiesPanel: { parent: propertiesPanelParent },
                additionalModules: extraModules,
                clipboard,
                capabilities,
                ...lintOptions,
                handleGlobalEscape: true,
            }),
        );
        expect(modeler.setSettings).not.toHaveBeenCalled();
    });

    it("routes the modeler's warnings and mode toggles", async () => {
        mocks.createModeler.mockResolvedValue({ setSettings: vi.fn() });
        const { posted, surfaces, onModelerModeChanged } = factoriesWith();

        await surfaces.implement!({ container, engine: "c7", theme: "light", mode: "implement" });
        const options = mocks.createModeler.mock.calls[0][1];
        options.onWarning("unknown element");
        options.onModeChanged("design");

        expect(posted).toEqual([
            expect.objectContaining({ type: "LogWarningCommand", message: "unknown element" }),
        ]);
        expect(onModelerModeChanged).toHaveBeenCalledExactlyOnceWith("design");
    });

    it("posts the modeler's template rejections as log lines before one notice", async () => {
        mocks.createModeler.mockResolvedValue({ setSettings: vi.fn() });
        const { posted, surfaces } = factoriesWith();

        await surfaces.implement!({ container, engine: "c7", theme: "light", mode: "implement" });
        const options = mocks.createModeler.mock.calls[0][1];
        options.onElementTemplatesErrors([new Error("bad"), "worse"]);
        options.onElementTemplatesErrors([]);

        expect(posted).toEqual([
            expect.objectContaining({
                type: "LogWarningCommand",
                message: "Element template rejected: bad",
            }),
            expect.objectContaining({
                type: "LogWarningCommand",
                message: "Element template rejected: worse",
            }),
            expect.objectContaining({
                type: "ShowInfoCommand",
                message:
                    "2 element templates were rejected and are ignored. See the log for details.",
            }),
        ]);
    });

    it("applies settings the host pushed while the modeler initialised", async () => {
        const modeler = { setSettings: vi.fn() };
        const creation = deferred<typeof modeler>();
        mocks.createModeler.mockReturnValue(creation.promise);
        const { surfaces, hostModelerState } = factoriesWith();

        const built = surfaces.implement!({
            container,
            engine: "c7",
            theme: "light",
            mode: "implement",
        });
        await vi.waitFor(() => expect(mocks.createModeler).toHaveBeenCalled());
        hostModelerState.rememberSettings(settings(["bpmn:ScriptTask"]));
        creation.resolve(modeler);
        await built;

        expect(mocks.createModeler.mock.calls[0][1].settings).toBeUndefined();
        expect(modeler.setSettings).toHaveBeenCalledExactlyOnceWith(settings(["bpmn:ScriptTask"]));
    });

    describe("plugins", () => {
        const neutralModule = { __init__: ["neutral"] };
        const platformModule = { __init__: ["platform"] };
        const acmeModdle = { prefix: "acme" };
        const builtEngines: (Engine | undefined)[] = [];
        const plugins: SurfacePlugins = {
            build: (engine, build) => {
                builtEngines.push(engine);
                return build({
                    additionalModules: engine ? [neutralModule, platformModule] : [neutralModule],
                    moddleExtensions: { acme: acmeModdle },
                });
            },
        };

        afterEach(() => {
            builtEngines.length = 0;
        });

        it("leaves the readonly viewer without plugins", async () => {
            mocks.createViewer.mockResolvedValue({});
            const { surfaces, extraModules } = factoriesWith(undefined, Promise.resolve(plugins));

            await surfaces.view!({ container, engine: "c7", theme: "light" });

            expect(mocks.createViewer.mock.calls[0][1].additionalModules).toEqual(extraModules);
            expect(builtEngines).toEqual([]);
        });

        it("gives an untagged model's designer only the engine-neutral plugins", async () => {
            mocks.createDesigner.mockResolvedValue({ setFavouriteBpmnElements: vi.fn() });
            const { surfaces, extraModules } = factoriesWith(undefined, Promise.resolve(plugins));

            await surfaces.design!({ container, engine: undefined, theme: "light" });

            expect(builtEngines).toEqual([undefined]);
            expect(mocks.createDesigner.mock.calls[0][1]).toMatchObject({
                additionalModules: [...extraModules, neutralModule],
                moddleExtensions: { acme: acmeModdle },
            });
        });

        it("gives a tagged model's modeler its engine's plugins too", async () => {
            mocks.createModeler.mockResolvedValue({ setSettings: vi.fn() });
            const { surfaces, extraModules } = factoriesWith(undefined, Promise.resolve(plugins));

            await surfaces.implement!({ container, engine: "c7", theme: "light", mode: "implement" });

            expect(builtEngines).toEqual(["c7"]);
            expect(mocks.createModeler.mock.calls[0][1]).toMatchObject({
                additionalModules: [...extraModules, neutralModule, platformModule],
                moddleExtensions: { acme: acmeModdle },
            });
        });

        it("builds an editable surface only once the plugins have loaded", async () => {
            mocks.createModeler.mockResolvedValue({ setSettings: vi.fn() });
            const pluginsLoaded = deferred<SurfacePlugins>();
            const { surfaces } = factoriesWith(undefined, pluginsLoaded.promise);

            const built = surfaces.implement!({
                container,
                engine: "c7",
                theme: "light",
                mode: "implement",
            });
            await Promise.resolve();
            await Promise.resolve();
            expect(mocks.createModeler).not.toHaveBeenCalled();

            pluginsLoaded.resolve(plugins);
            await built;

            expect(mocks.createModeler).toHaveBeenCalledOnce();
        });
    });
});
