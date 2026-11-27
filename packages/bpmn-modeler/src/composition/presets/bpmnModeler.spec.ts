import { describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import type { ModalSurface } from "../../kernel/port/bpmnSurface";
import type { CreateModelerOptions } from "../../modeler/port/publicApi";
import { bpmnModelerOver } from "./bpmnModeler";

function fakeSurface(services: Record<string, unknown> = {}) {
    let destroyed = false;
    const listeners = new Map<string, (event: unknown) => void>();
    const eventBus = {
        on: (event: string, listener: (event: unknown) => void) => listeners.set(event, listener),
        off: (event: string) => listeners.delete(event),
    };
    const injector = { get: (name: string) => services[name] ?? null };
    const surface = {
        getService: (name: string) => {
            if (destroyed) {
                throw new NoModelerError();
            }
            return name === "eventBus" ? eventBus : name === "injector" ? injector : services[name];
        },
        destroy: vi.fn(() => {
            destroyed = true;
        }),
    };
    return { surface: surface as unknown as ModalSurface, listeners, destroy: surface.destroy };
}

function options(extra: Partial<CreateModelerOptions> = {}): CreateModelerOptions {
    return { engine: "c7", propertiesPanel: { parent: document.createElement("aside") }, ...extra };
}

describe("bpmnModelerOver", () => {
    it("hands the lint module's ID convention to the element-ID feature", async () => {
        const convention = { pattern: "x" };
        const elementIds = { configure: vi.fn() };
        const { surface } = fakeSurface({ elementIds });

        await bpmnModelerOver(
            surface,
            options({
                linting: {
                    module: { createElementIdConvention: () => convention },
                } as unknown as CreateModelerOptions["linting"],
            }),
        );

        expect(elementIds.configure).toHaveBeenCalledWith(expect.objectContaining({ convention }));
    });

    it("destroys the surface and rethrows when attaching fails", async () => {
        const error = new Error("convention boom");
        const { surface, destroy } = fakeSurface({ elementIds: { configure: vi.fn() } });

        await expect(
            bpmnModelerOver(
                surface,
                options({
                    linting: {
                        module: {
                            createElementIdConvention: () => {
                                throw error;
                            },
                        },
                    } as unknown as CreateModelerOptions["linting"],
                }),
            ),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledOnce();
    });

    it("reports template validation errors until it is destroyed", async () => {
        const onElementTemplatesErrors = vi.fn();
        const { surface, listeners } = fakeSurface({
            elementTemplatesLoader: { setTemplates: vi.fn() },
            elementTemplateOffer: { setHidden: vi.fn() },
        });

        const modeler = await bpmnModelerOver(surface, options({ onElementTemplatesErrors }));
        listeners.get("elementTemplates.errors")?.({ errors: ["bad"] });
        modeler.destroy();

        expect(onElementTemplatesErrors).toHaveBeenCalledWith(["bad"]);
        expect(listeners.has("elementTemplates.errors")).toBe(false);
    });
});

describe("BpmnModeler.setSettings", () => {
    it("fans the settings out to the transaction boundaries, favourites and element IDs", async () => {
        const services = {
            transactionBoundaryVisibility: { setVisible: vi.fn() },
            appendMenuOverride: { setFavourites: vi.fn() },
            elementIds: { configure: vi.fn() },
        };
        const modeler = await bpmnModelerOver(fakeSurface(services).surface, options());

        modeler.setSettings({
            showTransactionBoundaries: false,
            favouriteBpmnElements: ["bpmn:UserTask"],
            elementIdsFollowName: true,
        });

        expect(services.transactionBoundaryVisibility.setVisible).toHaveBeenCalledWith(false);
        expect(services.appendMenuOverride.setFavourites).toHaveBeenCalledWith(["bpmn:UserTask"]);
        expect(services.elementIds.configure).toHaveBeenLastCalledWith(
            expect.objectContaining({ followName: true }),
        );
    });

    it("throws NoModelerError on a destroyed modeler and keeps nothing", async () => {
        const services = { alignToOrigin: { align: vi.fn() } };
        const modeler = await bpmnModelerOver(fakeSurface(services).surface, options());
        modeler.destroy();

        expect(() => modeler.setSettings({ alignToOrigin: true })).toThrow(NoModelerError);
    });

    it("aligns to the origin only when the setting asks for it", async () => {
        const services = { alignToOrigin: { align: vi.fn() } };
        const modeler = await bpmnModelerOver(fakeSurface(services).surface, options());

        modeler.alignElementsToOrigin();
        modeler.setSettings({ alignToOrigin: true });
        modeler.alignElementsToOrigin();

        expect(services.alignToOrigin.align).toHaveBeenCalledOnce();
    });
});
