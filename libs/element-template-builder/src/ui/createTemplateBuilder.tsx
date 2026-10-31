/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { render } from "@bpmn-io/properties-panel/preact";

import type { TemplateEdit } from "../domain/templateText";
import type { Translate } from "./settings";
import { TemplateBuilder, type TemplateBuilderState } from "./TemplateBuilder";
import "./builder.css";

export interface TemplateBuilderOptions {
    /** Receives every change the user makes, as edits to apply to the template's text. */
    onEdit: (edits: TemplateEdit[]) => void;
    translate?: Translate;
}

export interface TemplateBuilderHandle {
    show(state: TemplateBuilderState): void;
    destroy(): void;
}

const untranslated: Translate = (template, replacements = {}) =>
    template.replace(/{(\w+)}/g, (match, key: string) => replacements[key] ?? match);

/** Mounts the builder form for element templates into `parent`. */
export function createTemplateBuilder(
    parent: HTMLElement,
    { onEdit, translate = untranslated }: TemplateBuilderOptions,
): TemplateBuilderHandle {
    const container = parent.ownerDocument.createElement("div");
    container.className = "etb-builder";
    parent.appendChild(container);
    return {
        show(state) {
            render(
                <TemplateBuilder state={state} onEdit={onEdit} translate={translate} />,
                container,
            );
        },
        destroy() {
            render(null, container);
            container.remove();
        },
    };
}
