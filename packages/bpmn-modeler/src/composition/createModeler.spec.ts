import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsupportedEngineError } from "@miragon/bpmn-modeler-types";

const mocks = vi.hoisted(() => ({
    setLanguage: vi.fn(),
    createSurface: vi.fn(),
    modelerFeatures: vi.fn(),
    over: vi.fn(),
    calls: [] as string[],
    impls: {} as Record<string, () => void>,
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({ i18n: { setLanguage: mocks.setLanguage } }));
vi.mock("bpmn-js/lib/Modeler", () => ({ default: class Modeler {} }));
vi.mock("./createSurface", () => ({ createSurface: mocks.createSurface }));
vi.mock("./presets/modelerFeatures", () => ({ modelerFeatures: mocks.modelerFeatures }));
vi.mock("./presets/bpmnModeler", () => ({ BpmnModeler: { over: mocks.over } }));

import Modeler from "bpmn-js/lib/Modeler";
import { createModeler } from "./createModeler";

function fakeModeler() {
    const step = (name: string) =>
        vi.fn(() => {
            mocks.calls.push(name);
            mocks.impls[name]?.();
        });
    return {
        setElementTemplates: step("setElementTemplates"),
        setSettings: step("setSettings"),
        destroy: step("destroy"),
    };
}

const SURFACE = { surface: true };
const engineFeature = { id: "camunda7", modules: [] };
const callerFeature = { id: "caller", modules: [] };

function options(extra: object = {}) {
    return {
        engine: "c7",
        propertiesPanel: { parent: document.createElement("aside") },
        elementTemplates: [{}],
        settings: {},
        locale: "de",
        ...extra,
    } as never;
}

function arrange(features: unknown[] = [Promise.resolve(engineFeature), callerFeature]) {
    const modeler = fakeModeler();
    mocks.modelerFeatures.mockReturnValue(features);
    mocks.createSurface.mockResolvedValue(SURFACE);
    mocks.over.mockResolvedValue(modeler);
    mocks.setLanguage.mockImplementation(() => mocks.calls.push("setLanguage"));
    return modeler;
}

afterEach(() => {
    mocks.impls = {};
    mocks.calls.length = 0;
    vi.resetAllMocks();
});

describe("createModeler", () => {
    it("builds the surface from the resolved features and the options", async () => {
        arrange();
        const container = document.createElement("main");
        const onModeChanged = vi.fn();
        const onWarning = vi.fn();
        const onError = vi.fn();
        const opts = options({
            mode: "design",
            theme: "dark",
            handleGlobalEscape: true,
            onModeChanged,
            onWarning,
            onError,
        });

        await createModeler(container, opts);

        expect(mocks.modelerFeatures).toHaveBeenCalledWith(container, opts);
        expect(mocks.createSurface).toHaveBeenCalledWith(container, {
            base: Modeler,
            features: [engineFeature, callerFeature],
            mode: "design",
            extraRoots: [(opts as { propertiesPanel: { parent: HTMLElement } }).propertiesPanel.parent],
            theme: "dark",
            handleGlobalEscape: true,
            onWarning,
            onError,
            onModeChanged,
        });
        expect(mocks.over).toHaveBeenCalledWith(SURFACE, opts);
    });

    it("defaults to implement mode", async () => {
        arrange();

        await createModeler(document.createElement("main"), options());

        expect(mocks.createSurface.mock.calls[0][1]).toMatchObject({ mode: "implement" });
    });

    it("applies templates, settings and locale in that order and returns the modeler", async () => {
        const modeler = arrange();

        const handle = await createModeler(document.createElement("main"), options());

        expect(handle).toBe(modeler);
        expect(mocks.calls).toEqual(["setElementTemplates", "setSettings", "setLanguage"]);
        expect(mocks.setLanguage).toHaveBeenCalledWith("de");
    });

    it("leaves the page's language alone without a locale", async () => {
        arrange();

        await createModeler(
            document.createElement("main"),
            options({ locale: undefined, elementTemplates: undefined, settings: undefined }),
        );

        expect(mocks.calls).toEqual([]);
    });

    it("rejects with a failed engine chunk's own error and builds nothing", async () => {
        const chunkError = new Error("chunk failed");
        arrange([Promise.reject(chunkError), callerFeature]);

        await expect(createModeler(document.createElement("main"), options())).rejects.toBe(
            chunkError,
        );
        expect(mocks.createSurface).not.toHaveBeenCalled();
    });

    it("rejects an unknown engine before it builds anything", async () => {
        arrange();
        mocks.modelerFeatures.mockImplementation(() => {
            throw new UnsupportedEngineError("c9");
        });

        await expect(
            createModeler(document.createElement("main"), options({ engine: "c9" })),
        ).rejects.toBeInstanceOf(UnsupportedEngineError);
        expect(mocks.createSurface).not.toHaveBeenCalled();
    });

    it("rejects a moddle prefix that two keys carry, as moddle does", async () => {
        const camunda = { prefix: "camunda", uri: "a" };
        arrange([
            { id: "camunda7", modules: [], moddleExtensions: { camunda } },
            { id: "caller", modules: [], moddleExtensions: { mine: { ...camunda, uri: "b" } } },
        ]);

        await expect(createModeler(document.createElement("main"), options())).rejects.toThrow(
            "package with prefix <camunda> already defined",
        );
        expect(mocks.createSurface).not.toHaveBeenCalled();
    });

    it.each(["setElementTemplates", "setSettings"])(
        "destroys and rejects with the original error when %s fails",
        async (step) => {
            const modeler = arrange();
            const error = new Error(`${step} boom`);
            mocks.impls[step] = () => {
                throw error;
            };

            await expect(createModeler(document.createElement("main"), options())).rejects.toBe(
                error,
            );
            expect(modeler.destroy).toHaveBeenCalledOnce();
        },
    );

    it("surfaces the original error even when destroy also throws", async () => {
        const modeler = arrange();
        const error = new Error("locale boom");
        mocks.setLanguage.mockImplementation(() => {
            throw error;
        });
        mocks.impls.destroy = () => {
            throw new Error("teardown failure");
        };

        await expect(createModeler(document.createElement("main"), options())).rejects.toBe(
            error,
        );
        expect(modeler.destroy).toHaveBeenCalledOnce();
    });
});
