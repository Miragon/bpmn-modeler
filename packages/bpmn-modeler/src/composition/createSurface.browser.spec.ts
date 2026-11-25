import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import NativeCopyPasteModule from "bpmn-js-native-copy-paste";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { clipboard } from "../clipboard/adapter/in/clipboardFeature";
import { FAR_FROM_ORIGIN_XML, START_EVENT_XML } from "../__fixtures__/bpmnXml";
import { mountWithPanel, removeMounts, wait } from "../__fixtures__/surfaceMount";
import type { EditingSurface, ModalSurface, ViewingSurface } from "../kernel/port/bpmnSurface";
import { createSurface } from "./createSurface";

/**
 * The kernel end to end on real bpmn-js bases, with the smallest feature lists:
 * the presets' own lists stay pinned by `presetModulePins.browser.spec.ts`.
 */

const NATIVE_COPY_PASTE = { id: "nativeCopyPaste", modules: [NativeCopyPasteModule] };

function idsIn(xml: string): string[] {
    return [...xml.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id).sort();
}

afterEach(removeMounts);

describe("createSurface on the modeler base", () => {
    it("loads and exports a diagram and opens bpmn-js's empty diagram without a template", async () => {
        const { container } = mountWithPanel();
        const surface = await createSurface(container, { base: Modeler, features: [] });
        try {
            await surface.loadDiagram(FAR_FROM_ORIGIN_XML);
            expect(idsIn(await surface.exportDiagram())).toEqual(idsIn(FAR_FROM_ORIGIN_XML));

            await surface.newDiagram();
            expect(await surface.exportDiagram()).toContain('id="StartEvent_1"');
            expect(surface.getService("modeling")).toBeDefined();
        } finally {
            surface.destroy();
        }
    });

    it("opens the diagramTemplate slot's XML on newDiagram", async () => {
        const { container } = mountWithPanel();
        const template = {
            id: "template",
            modules: [{ diagramTemplate: ["value", { newDiagramXml: () => START_EVENT_XML }] }],
        };
        const surface = await createSurface(container, { base: Modeler, features: [template] });
        try {
            await surface.newDiagram();

            expect(idsIn(await surface.exportDiagram())).toEqual(idsIn(START_EVENT_XML));
        } finally {
            surface.destroy();
        }
    });

    it("switches the mode, moves the roots' attribute and tells the host once", async () => {
        const { container, panel } = mountWithPanel();
        const onModeChanged = vi.fn();
        const surface = await createSurface(container, {
            base: Modeler,
            features: [],
            mode: "design",
            extraRoots: [panel],
            onModeChanged,
        });
        try {
            expect(container.getAttribute("data-bpmn-mode")).toBe("design");

            surface.setMode("implement");
            surface.setMode("implement");

            expect(onModeChanged).toHaveBeenCalledExactlyOnceWith("implement");
            expect(surface.getMode()).toBe("implement");
            expect(panel.getAttribute("data-bpmn-mode")).toBe("implement");
        } finally {
            surface.destroy();
        }
        expect(container.hasAttribute("data-bpmn-mode")).toBe(false);
    });

    it("returns Escape from an extra root to the canvas", async () => {
        const { container, panel } = mountWithPanel();
        const input = document.createElement("input");
        panel.append(input);
        const surface = await createSurface(container, {
            base: Modeler,
            features: [],
            extraRoots: [panel],
        });
        try {
            await surface.loadDiagram(FAR_FROM_ORIGIN_XML);
            input.focus();

            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

            await vi.waitFor(() => expect(surface.getService("canvas").isFocused()).toBe(true));
            // Escape re-focuses once more on the next task; a destroy before it would throw there.
            await wait(0);
        } finally {
            surface.destroy();
        }
    });

    it("patches execCommand for the clipboard feature only while the surface lives", async () => {
        const { container, panel } = mountWithPanel();
        const bridge = { requestClipboard: vi.fn(async () => ""), writeClipboard: vi.fn() };
        const surface = await createSurface(container, {
            base: Modeler,
            features: [NATIVE_COPY_PASTE, clipboard({ bridge })],
            extraRoots: [panel],
        });

        expect(Object.hasOwn(document, "execCommand")).toBe(true);
        surface.destroy();

        expect(Object.hasOwn(document, "execCommand")).toBe(false);
    });

    it("fails the clipboard feature without native copy and paste, naming both", async () => {
        const { container } = mountWithPanel();
        const bridge = { requestClipboard: vi.fn(async () => ""), writeClipboard: vi.fn() };

        await expect(
            createSurface(container, { base: Modeler, features: [clipboard({ bridge })] }),
        ).rejects.toThrow('feature "clipboard" requires "nativeCopyPaste"');
        expect(container.childElementCount).toBe(0);
    });
});

describe("createSurface on the viewer base", () => {
    it("loads and exports a diagram, offers no editing and mounts the fit button last", async () => {
        const { container } = mountWithPanel();
        const surface = await createSurface(container, { base: NavigatedViewer, features: [] });
        try {
            await surface.loadDiagram(FAR_FROM_ORIGIN_XML);

            expect(idsIn(await surface.exportDiagram())).toEqual(idsIn(FAR_FROM_ORIGIN_XML));
            expect(() => surface.getService("modeling")).toThrow(/No provider for "modeling"/);
            expect("newDiagram" in surface).toBe(false);
            expect(container.querySelector(".djs-container")?.lastElementChild?.className).toBe(
                "fit-viewport-button",
            );
        } finally {
            surface.destroy();
        }
    });

    it("builds through a lazy import of the base", async () => {
        const { container } = mountWithPanel();
        const surface = await createSurface(container, {
            base: () => import("bpmn-js/lib/NavigatedViewer"),
            features: [],
        });
        try {
            expect(surface.base).toBe("viewer");
            await surface.loadDiagram(START_EVENT_XML);
        } finally {
            surface.destroy();
        }
    });
});

describe("createSurface types", () => {
    it("picks the surface kind from the base and the mode", () => {
        const container = document.createElement("div");
        type Built<T> = T extends Promise<infer S> ? S : never;
        const _modal = () =>
            createSurface(container, { base: Modeler, features: [], mode: "design" });
        const _editing = () => createSurface(container, { base: Modeler, features: [] });
        const _viewing = () => createSurface(container, { base: NavigatedViewer, features: [] });

        expectTypeOf<Built<ReturnType<typeof _modal>>>().toEqualTypeOf<ModalSurface>();
        expectTypeOf<Built<ReturnType<typeof _editing>>>().toEqualTypeOf<EditingSurface>();
        expectTypeOf<Built<ReturnType<typeof _viewing>>>().toEqualTypeOf<ViewingSurface>();
    });
});
