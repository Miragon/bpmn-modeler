import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Two specs live here. The mocked matrix below proves the failure contract
 * (`createDesigner` destroys a partially-initialised surface when a
 * post-allocation step throws, #1495) without a live bpmn-js instance.
 *
 * The runtime `describe.skip` documents the editable-services contract and is
 * ready to un-skip once the remaining wall lifts. The old i18n-extras blocker is
 * gone — `vitest.aliases.ts` resolves `@miragon/bpmn-modeler-i18n-extras` for
 * this project — but a full bpmn-js Modeler still lays out an SVG canvas jsdom
 * cannot (the wall `createViewer.spec.ts` documents, ADR 0011), so a
 * rendered-diagram assertion would throw. The real runtime proof lives in the
 * demo page `apps/demo-webapp/bpmn/design.html` and the type-level conformance
 * in `publicApi.spec.ts`.
 */

const mocks = vi.hoisted(() => ({
    extend: vi.fn(),
    setLanguage: vi.fn(),
    extras: { overlay: true },
    instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>>,
    impls: {} as Record<string, () => void | Promise<void>>,
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    i18n: { extend: mocks.extend, setLanguage: mocks.setLanguage },
}));
vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: mocks.extras }));
vi.mock("./designer", () => ({
    BpmnDesigner: class {
        init = vi.fn(() => Promise.resolve(mocks.impls.init?.()));
        setTheme = vi.fn(() => mocks.impls.setTheme?.());
        destroy = vi.fn(() => mocks.impls.destroy?.());
        constructor(
            public readonly container: HTMLElement,
            public readonly options: unknown,
        ) {
            mocks.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
        }
    },
}));

import { createDesigner } from "./createDesigner";

const baseOptions = () => ({
    propertiesPanel: { parent: document.createElement("aside") },
    locale: "de",
});

function lastInstance() {
    return mocks.instances[mocks.instances.length - 1];
}

afterEach(() => {
    mocks.impls = {};
    mocks.instances.length = 0;
    vi.clearAllMocks();
});

describe("createDesigner (mocked failure contract, #1495)", () => {
    it("engages theming and locale and returns the handle on success", async () => {
        const handle = await createDesigner(document.createElement("main"), baseOptions() as never);

        expect(handle).toBe(lastInstance());
        expect(lastInstance().setTheme).toHaveBeenCalledWith("automatic");
        expect(mocks.setLanguage).toHaveBeenCalledWith("de");
        expect(lastInstance().destroy).not.toHaveBeenCalled();
    });

    const phases = ["init", "setTheme"] as const;

    it.each(phases)("destroys and rejects with the original error when %s fails", async (phase) => {
        const error = new Error(`${phase} boom`);
        mocks.impls[phase] = () => {
            throw error;
        };

        await expect(
            createDesigner(document.createElement("main"), baseOptions() as never),
        ).rejects.toBe(error);
        expect(lastInstance().destroy).toHaveBeenCalledOnce();
    });

    it("destroys and rejects when setting the locale fails", async () => {
        const error = new Error("locale boom");
        mocks.setLanguage.mockImplementationOnce(() => {
            throw error;
        });

        await expect(
            createDesigner(document.createElement("main"), baseOptions() as never),
        ).rejects.toBe(error);
        expect(lastInstance().destroy).toHaveBeenCalledOnce();
    });

    it("surfaces the original error even when destroy also throws", async () => {
        const error = new Error("init boom");
        mocks.impls.init = () => {
            throw error;
        };
        mocks.impls.destroy = () => {
            throw new Error("teardown failure");
        };

        await expect(
            createDesigner(document.createElement("main"), baseOptions() as never),
        ).rejects.toBe(error);
        expect(lastInstance().destroy).toHaveBeenCalledOnce();
    });
});

describe.skip("createDesigner (runtime, jsdom — blocked by the SVG-layout wall)", () => {
    it("exposes the editable core services (inverse of the viewer's readonly proof)", async () => {
        const { createDesigner: realCreateDesigner } =
            await vi.importActual<typeof import("./createDesigner")>("./createDesigner");
        const container = document.createElement("div");
        const panel = document.createElement("div");
        document.body.append(container, panel);

        const designer = await realCreateDesigner(container, {
            propertiesPanel: { parent: panel },
        });

        // Editable: the modelling services a viewer never registers ARE present.
        expect(designer.getService("modeling")).toBeDefined();
        expect(designer.getService("commandStack")).toBeDefined();
        // Engine-neutral: none of the Camunda services are registered.
        expect(() => designer.getService("elementTemplates")).toThrow();
        expect(() => designer.getService("transactionBoundaries")).toThrow();
        // The panel renders under the supplied parent.
        expect(panel.querySelector(".bio-properties-panel")).not.toBeNull();

        designer.destroy();
    });

    it("creates a new diagram and exports XML with no execution platform", async () => {
        const { createDesigner: realCreateDesigner } =
            await vi.importActual<typeof import("./createDesigner")>("./createDesigner");
        const container = document.createElement("div");
        const panel = document.createElement("div");
        document.body.append(container, panel);

        const designer = await realCreateDesigner(container, {
            propertiesPanel: { parent: panel },
        });
        await designer.newDiagram();
        const xml = await designer.exportDiagram();
        // The mode marker: a fresh Design diagram carries no execution platform.
        expect(xml).not.toContain("modeler:executionPlatform");

        designer.destroy();
    });
});
