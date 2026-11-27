import {
    type Disposer,
    type ElementTemplateRef,
    type MinimalEventBus,
    subscribe,
} from "@miragon/bpmn-modeler-types";

import type { EditingSurface } from "../../kernel/port/bpmnSurface";
import {
    ELEMENT_TEMPLATE_OFFER,
    ELEMENT_TEMPLATES_ERRORS,
    ELEMENT_TEMPLATES_LOADER,
} from "../domain/elementTemplateNames";

interface TemplatesInjector {
    get<T>(name: string, strict: false): T | null;
}

interface TemplatesLoader {
    setTemplates(templates: object[]): void;
}

interface HidingOffer {
    setHidden(refs: readonly ElementTemplateRef[]): void;
}

/** @experimental What a host calls on a surface's element-templates feature. */
export interface ElementTemplatesAccessor {
    setTemplates(templates: object[]): void;
    /** Replaces the previous set. */
    setHidden(refs: readonly ElementTemplateRef[]): void;
    /** Reports each template list that fails validation; an event without errors reports `[]`. */
    onErrors(listener: (errors: unknown[]) => void): Disposer;
}

/** @experimental `undefined` on a surface built without the element-templates feature. */
export function elementTemplatesOf(
    surface: Pick<EditingSurface, "getService">,
): ElementTemplatesAccessor | undefined {
    const injector = surface.getService<TemplatesInjector>("injector");
    const loader = injector.get<TemplatesLoader>(ELEMENT_TEMPLATES_LOADER, false);
    const offer = injector.get<HidingOffer>(ELEMENT_TEMPLATE_OFFER, false);
    if (!loader || !offer) {
        return undefined;
    }
    return {
        setTemplates: (templates) => {
            loader.setTemplates(templates);
        },
        setHidden: (refs) => {
            offer.setHidden(refs);
        },
        onErrors: (listener) =>
            subscribe(
                surface.getService<MinimalEventBus>("eventBus"),
                ELEMENT_TEMPLATES_ERRORS,
                (event: { errors?: unknown[] }) => {
                    listener(event.errors ?? []);
                },
            ),
    };
}
